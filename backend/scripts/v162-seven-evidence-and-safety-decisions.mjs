// v162 / #46-52. Source-level evidence does not mean a production feature is verified.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditChatSeven} from './v161-seven-chat-advertising-decisions.mjs';
import {parseCsv,summarizeDecisions} from './v153-decision-progress.mjs';
import {assertEvidenceFile} from './v155-critical-decisions.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const spec=(id,title,code,tests,gap)=>({id,title,code,tests,gap});
export const NEXT_SEVEN=Object.freeze([
 spec(46,'Sartarosh badge toifalari',
  [['backend/controllers/barberEvidenceBadgesV162.js',"identity_checked"],['frontend/src/pages/user/barber/badgeModelV162.js','BADGE_TYPES_V162']],
  [['backend/test/v162EvidenceBadges.unit.test.js',"test('evidence must"],['frontend/test/v162EvidenceBadges.test.js',"test('badge categories"]],
  'Three evidence-checked badge categories implemented. The badge is not an independent professional certification. PostgreSQL and browser E2E NOT RUN.'),
 spec(47,'Badge Admin tekshiruv dalillari',
  [['backend/database/migrations/20261220_barber_evidence_badges.sql','evidence_note'],['backend/controllers/barberEvidenceBadgesV162.js','changeInput'],['frontend/src/pages/AdminBadgePanelV162.jsx','onChange']],
  [['backend/test/v162EvidenceBadges.unit.test.js',"test('new grant"]],
  'Admin reason/evidence summary recorded transactionally; external evidence document review, real DB and role integration NOT VERIFIED.'),
 spec(48,'Badge nazorat va bekor qilish',
  [['backend/controllers/barberEvidenceBadgesV162.js',"input.action==='revoke'"],['backend/database/migrations/20261220_barber_evidence_badges.sql','barber_badge_audit_events'],['frontend/src/pages/user/barber/BarberPublicBadgesV162.jsx','publicBadgesV162']],
  [['backend/test/v162EvidenceBadges.unit.test.js',"test('revoke increments"]],
  'Revoke/re-grant revision and append-only API audit implemented; no browser or real PostgreSQL race E2E.'),
 spec(49,'Dalilli shikoyat va apellyatsiya',
  [['backend/controllers/profileIssueReports.js','validateReport'],['backend/routes/admin.js',"'/profile-reports/:id'"]],
  [['backend/test/v128ProfileIssueReports.unit.test.js',"test('v128: admin closes"]],
  'Evidence-described profile report and Admin review exist. Separate formal appeal, attachments and appeal resolution workflow NOT IMPLEMENTED.'),
 spec(50,'Sartarosh statistikasi taxminiy tushum',
  [['backend/controllers/barberEarningsController.js','paymentVerified: false'],['frontend/src/pages/barber/Earnings.jsx','To‘lov qabul qilingani tasdiqlanmagan.'],['frontend/src/pages/barber/Dashboard.jsx','(taxminiy)']],
  [['backend/test/v162EstimatedTurnover.unit.test.js',"test('v162 calculated"]],
  'Unverified payments now explicitly reported as estimates; real financial reconciliation/payment tracking absent by design. PostgreSQL E2E NOT RUN.'),
 spec(51,'No-showdan adolatli himoya',
  [['backend/controllers/walkinQueueController.js','expected_status'],['backend/database/migrations/20261214_walkin_service_started.sql','walkin_queue']],
  [['backend/test/v105NoShowSafety.unit.test.js',"test('v105: called"]],
  'Current queue no-show uses called-state CAS and audit; appeals/disputes and original booked-appointment no-show lifecycle still need review.'),
 spec(52,'Bron narx vaqt va manzil snapshoti',
  [['backend/services/bookingSelection.js','New bookings must always show the original service name'],['backend/services/bookingModification.js','total_price'],['backend/database/migrations/20261125_multi_service_bookings.sql','booking_services']],
  [['backend/test/bookingModification.unit.test.js',"test('successful reschedule"]],
  'Immutable price, service name/duration and time update are source tested; independent address snapshot at booking time not fully implemented/verified.'),
]);
export function auditBadgesSeven({projectRoot=ROOT,registryPath=path.join(ROOT,'docs/USTARA_185_NAZORAT.csv')}={}){
 const previous=auditChatSeven({projectRoot,registryPath});
 if(previous.uniqueSourceTraces!==49)throw Error('v162 previous trace count mismatch; NOT VERIFIED');
 const summary=summarizeDecisions(registryPath);
 if(previous.registrySha256!==summary.sha256)throw Error('v162 original registry checksum mismatch; NOT VERIFIED');
 const rows=parseCsv(fs.readFileSync(registryPath,'utf8').replace(/^\ufeff/,''));
 const seen=new Set();
 const decisions=NEXT_SEVEN.map(s=>{
  if(seen.has(s.id)||previous.decisions.some(d=>d.id===s.id)||rows[s.id]?.[0]!==String(s.id)||rows[s.id]?.[1]!==s.title)
   throw Error('v162 source decision mismatch or duplicate; NOT VERIFIED');
  seen.add(s.id);
  const code=s.code.map(([file,needle])=>assertEvidenceFile(projectRoot,file,needle).path);
  const tests=s.tests.map(([file,needle])=>assertEvidenceFile(projectRoot,file,needle).path);
  return {id:s.id,decision:s.title,originalStatus:rows[s.id][3],code,tests,sourceStatus:'PARTIAL_SOURCE_GAP',
   missingImplementation:[s.gap],productionVerified:false};
 });
 if(seen.size!==7||previous.uniqueSourceTraces+7!==56)throw Error('v162 unique count mismatch; NOT VERIFIED');
 return {version:'v162',totalDecisions:185,registrySha256:summary.sha256,previousSourceTraces:49,
  newSourceTraces:7,uniqueSourceTraces:56,notYetTraced:129,decisions,
  knownGaps:[...previous.knownGaps,...decisions.map(d=>({id:d.id,missingImplementation:d.missingImplementation}))],
  originalCounts:summary.counts,postgresE2E:'NOT_RUN',browserE2E:'NOT_RUN',telegramE2E:'NOT_RUN',
  releaseReadiness:'NOT_VERIFIED',productionReady:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=auditBadgesSeven();if(process.argv.includes('--require-production'))throw Error('v162 real DB/browser/E2E NOT VERIFIED');
  console.log(process.argv.includes('--json')?JSON.stringify(result,null,2):`v162: ${result.uniqueSourceTraces}/185 source references, production NOT VERIFIED`);
 }catch(error){console.error(error.message);process.exitCode=1;}
}
