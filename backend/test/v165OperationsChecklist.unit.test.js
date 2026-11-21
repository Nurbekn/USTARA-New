'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {check}=require('../scripts/v165-operations-checklist.cjs');
const root=path.resolve(__dirname,'../..');
test('v165 offline preflight never starts database, restore, deploy or Telegram calls',()=>{
 const result=check();assert.equal(result.passed,true);
 assert.equal(result.offlineOnly,true);assert.equal(result.productionReady,false);
 assert.equal(result.integrationTests,'NOT_RUN');
 assert.equal(result.backupRestoreDrill,'NOT_RUN');
 const src=fs.readFileSync(require.resolve('../scripts/v165-operations-checklist.cjs'),'utf8');
 assert.doesNotMatch(src,/\b(?:execSync|spawn|fetch|pg_restore|pg_dump)\s*\(/);
});
test('v165 runbook includes backups and deployment with explicit human approval and no automatic restore',()=>{
 const doc=fs.readFileSync(path.join(root,'docs/v165-operations-runbook.md'),'utf8');
 assert.match(doc,/### #71 — Zaxira va tiklash/);
 assert.match(doc,/### #72 — Bosqichli deployment/);
 assert.match(doc,/pg_dump/);assert.match(doc,/pg_restore --list/);
 assert.match(doc,/restore drill/);
 assert.match(doc,/USTARA_ADMIN_READONLY_ROLLOUT=0/);
 assert.match(doc,/NOT RUN/);
});
test('v165 original #67–#73 static source trace has 77 unique, no production assertion',()=>{
 const script=path.join(root,'backend/scripts/v165-seven-operations-decisions.mjs');
 const r=JSON.parse(execFileSync(process.execPath,[script,'--json'],{encoding:'utf8'}));
 assert.deepEqual(r.decisions.map(x=>x.id),[67,68,69,70,71,72,73]);
 assert.equal(r.previousSourceTraces,70);assert.equal(r.uniqueSourceTraces,77);
 assert.equal(r.notYetTraced,108);assert.equal(r.productionReady,false);
 assert.ok(r.decisions.every(x=>x.sourceStatus==='PARTIAL_SOURCE_GAP'&&x.missingImplementation.length>0));
 assert.throws(()=>execFileSync(process.execPath,[script,'--require-production'],{stdio:'pipe'}));
});
