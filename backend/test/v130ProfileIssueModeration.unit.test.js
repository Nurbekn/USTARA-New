const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createProfileIssueHandlers,parseReportListQuery}=require('../controllers/profileIssueReports');
function mock(answers=[]) {
 const calls=[];
 const pool={async query(sql,params){calls.push({sql,params});const ans=answers.shift();if(ans instanceof Error)throw ans;return ans??{rows:[],rowCount:0};}};
 const res={statusCode:200,headers:{},status(x){this.statusCode=x;return this;},set(k,v){this.headers[k]=v;return this;},json(value){this.payload=value;return this;}};
 return {calls,res,h:createProfileIssueHandlers(pool)};
}
const customer={role:'customer',accountId:45};
const admin={role:'admin',id:7};
test('v130: only customer may read their own pending reasons',async()=>{
 for(const user of [null,{role:'barber',accountId:45},admin,{role:'customer',accountId:null}]) {
  const m=mock(); await m.h.ownPending({user,params:{id:'9'}},m.res);
  assert.equal(m.res.statusCode,403);assert.equal(m.calls.length,0);
 }
});
test('v130: invalid profile identifiers never touch database',async()=>{
 for(const id of ['0','-2','1e2','7/../admin',String(Number.MAX_SAFE_INTEGER+1)]){
  const m=mock();await m.h.ownPending({user:customer,params:{id}},m.res);
  assert.equal(m.res.statusCode,400);assert.equal(m.calls.length,0);
 }
});
test('v130: pending reasons belong only to authenticated account and exact barber',async()=>{
 const m=mock([{rows:[{reason:'address',id:123,reporter_user_id:2,details:'secret'}, {reason:'hours'}]}]);
 await m.h.ownPending({user:customer,params:{id:'9'}},m.res);
 assert.deepEqual(m.calls[0].params,[9,45]);
 assert.match(m.calls[0].sql,/r\.reporter_user_id=\$2 AND r\.status='pending'/);
 assert.equal(m.res.headers['Cache-Control'],'no-store');
 assert.deepEqual(m.res.payload,{pendingReasons:['address','hours']});
 assert.doesNotMatch(JSON.stringify(m.res.payload),/secret|reporter_user_id|id|45/);
});
test('v130: malformed database reasons and duplicates are excluded from private response',async()=>{
 const m=mock([{rows:[{reason:'media'},{reason:'media'},{reason:'unknown'},{reason:null},{reason:'__proto__'}]}]);
 await m.h.ownPending({user:customer,params:{id:9}},m.res);
 assert.deepEqual(m.res.payload,{pendingReasons:['media']});
});
test('v130: DB failure returns generic error without leaking credentials',async()=>{
 const m=mock([new Error('secret password and phone +998')]);
 const old=console.error;console.error=()=>{};
 try{await m.h.ownPending({user:customer,params:{id:9}},m.res);}finally{console.error=old;}
 assert.equal(m.res.statusCode,503);assert.doesNotMatch(JSON.stringify(m.res.payload),/password|secret|998/);
});
test('v130: extra report queue query keys are rejected before SQL',async()=>{
 assert.equal(parseReportListQuery({status:'all',page:'1',unexpected:'1'}),null);
 const m=mock();await m.h.list({user:admin,query:{status:'all',page:'1',sql:'true'}},m.res);
 assert.equal(m.res.statusCode,400);assert.equal(m.calls.length,0);
});
test('v130: list request fetches one sentinel beyond page size with stable offset',async()=>{
 const rows=Array.from({length:101},(_,i)=>({id:i+1,barber_id:2,status:'pending',reason:'media',details:'Example',reporter_user_id:55}));
 const m=mock([{rows}]);await m.h.list({user:admin,query:{status:'pending',page:'2'}},m.res);
 assert.match(m.calls[0].sql,/LIMIT 101 OFFSET \$2/);
 assert.deepEqual(m.calls[0].params,['pending',100]);
 assert.equal(m.res.payload.length,101);assert.equal(m.res.payload[100].reporter_user_id,undefined);
});
test('v130: exact 100 reports do not imply next page',async()=>{
 const m=mock([{rows:Array.from({length:100},(_,i)=>({id:i+1,barber_id:2,status:'pending',reason:'other',details:'Example'}))}]);
 await m.h.list({user:admin,query:{page:'1'}},m.res);
 assert.equal(m.res.payload.length,100);
});
test('v130: review rejects extraneous fields, arrays and empty bodies',async()=>{
 for(const body of [null,[],{status:['resolved']},{status:'resolved',reviewed_by_admin_id:22},{}]){
  const m=mock();await m.h.review({user:admin,params:{id:'9'},body},m.res);
  assert.equal(m.res.statusCode,400);assert.equal(m.calls.length,0);
 }
});
test('v130: valid review still requires pending status and expected reviewer',async()=>{
 const m=mock([{rows:[{id:'9',status:'resolved'}],rowCount:1}]);
 await m.h.review({user:admin,params:{id:'9'},body:{status:'resolved'}},m.res);
 assert.deepEqual(m.calls[0].params,[9,'resolved',7]);
 assert.match(m.calls[0].sql,/status='pending'/);assert.deepEqual(m.res.payload,{id:9,status:'resolved'});
});
test('v130: uncertain review transport failure never claims definitely not saved',async()=>{
 const m=mock([new Error('unknown COMMIT')]);const old=console.error;console.error=()=>{};
 try{await m.h.review({user:admin,params:{id:'9'},body:{status:'dismissed'}},m.res);}finally{console.error=old;}
 assert.equal(m.res.statusCode,503);
 assert.match(m.res.payload.message,/tasdiqlab bo‘lmadi/);
 assert.doesNotMatch(m.res.payload.message,/saqlanmadi/);
});
test('v130: authorized private route remains protected by auth middleware',()=>{
 const routes=fs.readFileSync(path.join(__dirname,'../routes/barbers.js'),'utf8');
 assert.match(routes,/router\.get\('\/:id\/profile-report\/status', authMiddleware, profileIssues\.ownPending\)/);
});
