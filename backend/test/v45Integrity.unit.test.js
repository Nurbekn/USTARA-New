'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {parseTapSummary}=require('../scripts/v40-staging');
const {summarize}=require('../scripts/v41-telegram-delivery-health');
const {inspectDependencies}=require('../scripts/v41-readiness');
const {verify}=require('../scripts/v45-decision-integrity');
const full=n=>`TAP version 13\n${Array.from({length:n},(_,i)=>`ok ${i+1} - test ${i+1}`).join('\n')}\n1..${n}\n# tests ${n}\n# pass ${n}\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0`;
test('v45 staging: valid TAP passed summary is accepted',()=>{
 assert.equal(parseTapSummary(full(2)).pass,2);
});
test('v45 staging: no TAP header, failed test and bailout all fail closed',()=>{
 for(const invalid of [full(2).replace('TAP version 13\n',''),full(1)+'\nnot ok 1 - silent failure',full(1)+'\nBail out!'])
  assert.throws(()=>parseTapSummary(invalid),/NOT PASS/);
});
test('v45 operator aggregates: nonpending cannot have due or overdue work',()=>{
 for(const status of ['sent','failed','uncertain','cancelled']){
  assert.throws(()=>summarize([{channel:'queue',status,total:3,due:1,stale_lease:0}]));
  assert.throws(()=>summarize([{channel:'smart_booking',status,total:3,due:0,overdue_pending:1,stale_lease:0}]));
 }
});
test('v45 operator aggregates: only processing and sending can have stale leases',()=>{
 assert.throws(()=>summarize([{channel:'queue',status:'pending',total:1,due:0,stale_lease:1}]));
 assert.throws(()=>summarize([{channel:'smart_booking',status:'sent',total:1,due:0,stale_lease:1}]));
 assert.equal(summarize([{channel:'queue',status:'processing',total:1,due:0,stale_lease:1}]).attention.length,1);
 assert.equal(summarize([{channel:'smart_booking',status:'sending',total:1,due:0,stale_lease:1}]).attention.length,1);
});
test('v45 release: decision hash confirms 185 unchanged requirements',()=>{
 const result=verify();assert.equal(result.decisions,185);
 assert.equal(result.status,'integrity_verified_not_feature_complete');
});
test('v45 release: altered decision register fails without approval',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-decisions-v45-'));
 try{
  const original=fs.readFileSync(path.resolve(__dirname,'../../docs/USTARA_185_NAZORAT.csv'),'utf8');
  const edited=path.join(dir,'decisions.csv');fs.writeFileSync(edited,original.replace('raqam,','raqam, '));
  assert.throws(()=>verify(edited));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('v45 dependency inspector refuses an entry escaping its installed package',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-deps-v45-'));
 try{
  const backend=path.join(dir,'backend');const front=path.join(dir,'frontend');
  fs.mkdirSync(path.join(backend,'node_modules','cors'),{recursive:true});fs.mkdirSync(front,{recursive:true});
  fs.writeFileSync(path.join(backend,'package.json'),'{}');fs.writeFileSync(path.join(front,'package.json'),'{}');
  fs.writeFileSync(path.join(backend,'node_modules','cors','package.json'),JSON.stringify({name:'cors',version:'1.0.0',main:'../../../outside.js'}));
  fs.writeFileSync(path.join(dir,'outside.js'),'module.exports = {}');
  assert.equal(inspectDependencies(dir).backend.cors,false);
  // Positive local-entry behavior is covered by v44Readiness.unit.test.js.
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
