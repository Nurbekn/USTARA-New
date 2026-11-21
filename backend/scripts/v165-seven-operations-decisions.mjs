// v165: #67–#73 original 185 decision registry source evidence, NOT runtime certification.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditAdminSeven} from './v164-seven-admin-navigation-decisions.mjs';
import {parseCsv,summarizeDecisions} from './v153-decision-progress.mjs';
import {assertEvidenceFile} from './v155-critical-decisions.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const item=(id,title,code,tests,gap)=>({id,title,code,tests,gap});
export const NEXT_SEVEN=Object.freeze([
 item(67,'Admin Telegram Control Center',
  [['backend/controllers/adminOpsReadOnlyV165.js',"kind==='telegram'"],['backend/routes/admin.js',"'/telegram/outbox'"],['frontend/src/pages/AdminOpsReadOnlyV165.jsx','summary[channel]']],
  [['backend/test/v165AdminOperations.unit.test.js','Telegram read is sanitized'],['frontend/test/v165AdminOperations.test.js','read-only Telegram']],
  'Outbox counters + health are read-only; real Telegram delivery, retries, reconciliation and PG data NOT VERIFIED.'),
 item(68,'Admin System Control va rollback',
  [['backend/controllers/adminOpsReadOnlyV165.js','automatedRollback:false'],['frontend/src/pages/AdminOpsReadOnlyV165.jsx','labels.system']],
  [['backend/test/v165AdminOperations.unit.test.js','System shows DB proof']],
  'Read-only system diagnostics added; NO in-app restart, rollback, approval workflow or live infrastructure metrics.'),
 item(69,'Demo va avtomatlashtirilgan test markazi',
  [['backend/scripts/v165-operations-checklist.cjs','offlineOnly:true'],['.github/workflows/v55-verify.yml','v165 source trace and operations checklist']],
  [['backend/test/v165OperationsChecklist.unit.test.js','v165 offline preflight']],
  'Package-free local/CI checklist exists; no production Demo/Test Center UI or real staged user flows.'),
 item(70,'Monitoring xizmatlar va ogohlantirish',
  [['backend/controllers/adminOpsReadOnlyV165.js','operatorReviewRequired'],['backend/scripts/v41-telegram-delivery-health.js','overdue_pending']],
  [['backend/test/v165AdminOperations.unit.test.js','System shows DB proof']],
  'Operator-visible outbox alerts; no long-term metrics, alert delivery, incident acknowledgement or multi-service monitoring.'),
 item(71,'Xavfsiz zaxira va tiklash',
  [['docs/v165-operations-runbook.md','### #71 — Zaxira va tiklash']],
  [['backend/test/v165OperationsChecklist.unit.test.js','v165 runbook includes backups']],
  'Manual backup/verify/restore guidance only; no automated encrypted backups or proven restoration drill.'),
 item(72,'Bosqichli deployment va rollback',
  [['docs/v165-operations-runbook.md','### #72 — Bosqichli deployment'],['.github/workflows/v55-verify.yml','v165 source trace and operations checklist']],
  [['backend/test/v165OperationsChecklist.unit.test.js','v165 runbook includes backups']],
  'Documented human-controlled staged release; no proven CDN/DB/browser staging deploy or rollback test.'),
 item(73,'Feature flags va bosqichli chiqarish',
  [['backend/services/opsReadOnlyFlagsV165.js','USTARA_ADMIN_READONLY_ROLLOUT'],['backend/controllers/adminOpsReadOnlyV165.js','enabledForAdmin']],
  [['backend/test/v165AdminOperations.unit.test.js','rollout percentages are strict']],
  'Server-side stable 0-100% Admin read-only diagnostics rollout only; full platform feature flag console not implemented.'),
]);
export function auditSevenOperations({projectRoot=ROOT,registryPath=path.join(ROOT,'docs/USTARA_185_NAZORAT.csv')}={}){
 const prev=auditAdminSeven({projectRoot,registryPath});
 if(prev.uniqueSourceTraces!==70)throw Error('v165 previous index mismatch; NOT VERIFIED');
 const summary=summarizeDecisions(registryPath);
 if(prev.registrySha256!==summary.sha256)throw Error('v165 original registry changed; NOT VERIFIED');
 const rows=parseCsv(fs.readFileSync(registryPath,'utf8').replace(/^\ufeff/,''));
 const seen=new Set();
 const decisions=NEXT_SEVEN.map(s=>{
  if(seen.has(s.id)||rows[s.id]?.[0]!==String(s.id)||rows[s.id]?.[1]!==s.title)throw Error(`v165 original #${s.id} mismatch`);
  seen.add(s.id);
  const code=s.code.map(([file,needle])=>assertEvidenceFile(projectRoot,file,needle).path);
  const tests=s.tests.map(([file,needle])=>assertEvidenceFile(projectRoot,file,needle).path);
  return {id:s.id,decision:s.title,originalStatus:rows[s.id][3],code,tests,
   sourceStatus:'PARTIAL_SOURCE_GAP',missingImplementation:[s.gap],productionVerified:false};
 });
 if(seen.size!==7)throw Error('v165 7 unique decisions required');
 return {version:'v165',totalDecisions:185,registrySha256:summary.sha256,
  previousSourceTraces:70,newSourceTraces:7,uniqueSourceTraces:77,notYetTraced:108,
  decisions,knownGaps:[...prev.knownGaps,...decisions.map(d=>({id:d.id,missingImplementation:d.missingImplementation}))],
  originalCounts:summary.counts,postgresE2E:'NOT_RUN',browserE2E:'NOT_RUN',telegramE2E:'NOT_RUN',
  backupRestoreDrill:'NOT_RUN',releaseReadiness:'NOT_VERIFIED',productionReady:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const report=auditSevenOperations();if(process.argv.includes('--require-production'))throw Error('v165 integration/production readiness NOT VERIFIED');
  console.log(process.argv.includes('--json')?JSON.stringify(report,null,2):`v165 ${report.uniqueSourceTraces}/185 static traces; production NOT VERIFIED`);
 }catch(e){console.error(e.message);process.exitCode=1;}
}
