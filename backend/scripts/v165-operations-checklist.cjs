'use strict';
// #69 package-free offline preflight. Reads only: files, metadata, source markers.
// Deliberately does not connect to Telegram, PostgreSQL or a deployed host.
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'../..');
const CHECKS=[
 ['Admin authenticated routes','backend/routes/admin.js',"'/system/readiness'"],
 ['Operator-only, read-only monitoring','backend/controllers/adminOpsReadOnlyV165.js','automaticResend:false'],
 ['Telegram outbox aggregate read','backend/scripts/v41-telegram-delivery-health.js','overdue_pending'],
 ['Reproducible staged rollout','backend/services/opsReadOnlyFlagsV165.js','USTARA_ADMIN_READONLY_ROLLOUT'],
 ['Backend unit tests','backend/test/v165AdminOperations.unit.test.js','v165'],
 ['Frontend unit tests','frontend/test/v165AdminOperations.test.js','v165'],
 ['Recovery and release runbook','docs/v165-operations-runbook.md','### #72 — Bosqichli deployment'],
 ['CI tests and source audit','.github/workflows/v55-verify.yml','v165 source trace and operations checklist'],
];
function check(root=ROOT){
 const results=CHECKS.map(([name,rel,needle])=>{
  const file=path.join(root,rel);
  const ok=file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.readFileSync(file,'utf8').includes(needle);
  return {name,ok};
 });
 return {version:'v165',offlineOnly:true,safeForProductionReadOnly:true,
  checks:results,passed:results.every(x=>x.ok),
  integrationTests:'NOT_RUN',backupRestoreDrill:'NOT_RUN',productionReady:false};
}
if(require.main===module){const report=check();console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;}
module.exports={check};
