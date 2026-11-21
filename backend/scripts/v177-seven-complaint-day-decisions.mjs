// v177: source review for #151–#157, NOT an implementation or production-ready certificate.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditSevenBookingPrivacy } from './v176-seven-booking-privacy-decisions.mjs';
import { assertEvidenceFile } from './v155-critical-decisions.mjs';
import { parseCsv, summarizeDecisions } from './v153-decision-progress.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SPECS=Object.freeze([
 {id:151,title:'Smart Complaint Flow',status:'PARTIAL_SOURCE_GAP',
  code:[['backend/controllers/socialReportReceiptsV177.js','createMyReportsHandler'],['backend/routes/social.js','/my-reports'],['frontend/src/pages/user/social/MyReportsV177.jsx','normalizeReportReceiptsV177'],['frontend/src/pages/user/Social.jsx','showMyReportsV177']],
  tests:[['backend/test/v177SocialReportReceipts.unit.test.js',"test('#151"],['frontend/test/v177SocialReportReceipts.test.js',"test('#151"]],
  gap:'Users can submit social post complaints and read up to 50 own submission receipts with server-only authorization. Admin adjudication, durable audit after post removal, appeals and real database/browser E2E do not exist; receipt is NOT a moderation outcome.'},
 {id:152,title:'Safe No-Show tasdiqlash',status:'PARTIAL_SOURCE_GAP',
  code:[['frontend/src/pages/barber/data/noShowConfirmationV105.js','confirmNoShow'],['frontend/src/pages/barber/Queue.jsx','noShowConfirmation']],
  tests:[['frontend/test/v105SafeNoShowConfirmation.test.js',"test("]],
  gap:'Queue no-show confirmation checks current caller/state; broader booking no-show policy and real PostgreSQL parallel transitions are unverified.'},
 {id:153,title:'Safe Day Closing',status:'PARTIAL_SOURCE_GAP',
  code:[['backend/controllers/walkinQueueController.js','dayClosePreview'],['frontend/src/pages/barber/Queue.jsx','dayCloseConfirmation']],
  tests:[['frontend/test/v106DayCloseReadiness.test.js',"test("],['backend/test/v107SafeDayClose.unit.test.js',"test("]],
  gap:'Queue close/reopen with preview and blockers exists; real PostgreSQL races and production calendar edge cases remain unverified.'},
 {id:154,title:'Narx darhol kuchga kiradi, kelajak scheduler YO‘Q',status:'PARTIAL_SOURCE_GAP',
  code:[['backend/controllers/servicesController.js','SET name = $1, price = $2'],['backend/services/bookingSelection.js','expectedPriceMatches']],
  tests:[['backend/test/bookingPriceSnapshot.unit.test.js',"test('bron ro‘yxati"]],
  gap:'Service edits update current price; old booking snapshots are intended to remain stable. No future-dated price scheduler was introduced; real PostgreSQL booking-edit races remain unverified.'},
 {id:155,title:'Egasi va ruxsatli menejer profilni tahrirlaydi',status:'NOT_IMPLEMENTED',
  gap:'A real multi-staff shop, owner/manager grants, scope-checked shop editing and Admin-approved ownership transfer have not been implemented. Current self-owned single-address shop editing is NOT manager access.'},
 {id:156,title:'Ko‘chish uchun maxsus workflow BEKOR',status:'CANCELLED_BY_USER',
  gap:'Explicitly cancelled by the final decision. No special relocation workflow should be built or counted as a missing feature.'},
 {id:157,title:'Xizmat tugadi uchun oddiy Ha Yo‘q tasdig‘i',status:'PARTIAL_SOURCE_GAP',
  code:[['frontend/src/pages/barber/data/serviceFinishConfirmationV100.js','confirmServiceFinish'],['frontend/src/pages/barber/Queue.jsx','finishConfirmation']],
  tests:[['frontend/test/v100ServiceFinishConfirmation.test.js',"test("]],
  gap:'Simple Yes/No flow exists and irreversible service completion remains server-authoritative. Real browser E2E and concurrent status transitions remain unverified; no Undo engine is desired.'},
]);
export function auditSevenComplaintDayDecisions({projectRoot=ROOT,registryPath=path.join(ROOT,'docs/USTARA_185_NAZORAT.csv')}={}) {
 const previous=auditSevenBookingPrivacy({projectRoot,registryPath});
 if(previous.indexedTotal!==151)throw Error('v177 expected 151 previously reviewed decisions');
 const summary=summarizeDecisions(registryPath);
 if(previous.registrySha256!==summary.sha256)throw Error('v177 registry fingerprint changed');
 const rows=parseCsv(fs.readFileSync(registryPath,'utf8').replace(/^\ufeff/,''));
 const decisions=SPECS.map(spec=>{
  if(rows[spec.id]?.[0]!==String(spec.id)||rows[spec.id]?.[1]!==spec.title)throw Error(`v177 registry mismatch #${spec.id}`);
  return {id:spec.id,decision:spec.title,originalStatus:rows[spec.id][3],sourceStatus:spec.status,
   code:(spec.code||[]).map(([p,needle])=>assertEvidenceFile(projectRoot,p,needle).path),
   tests:(spec.tests||[]).map(([p,needle])=>assertEvidenceFile(projectRoot,p,needle).path),
   missingImplementation:[spec.gap],productionVerified:false};
 });
 return {version:'v177',registrySha256:summary.sha256,totalDecisions:185,reviewedDecisions:7,
  previouslyIndexed:151,indexedNew:7,indexedTotal:158,notYetIndexed:27,
  sourcePartiallyImplemented:decisions.filter(x=>x.sourceStatus==='PARTIAL_SOURCE_GAP').length,
  requirementsNotImplemented:decisions.filter(x=>x.sourceStatus==='NOT_IMPLEMENTED').length,
  explicitlyCancelled:decisions.filter(x=>x.sourceStatus==='CANCELLED_BY_USER').length,
  decisions,postgresE2E:'NOT_RUN',browserE2E:'NOT_RUN',productionReady:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try {
  const result=auditSevenComplaintDayDecisions();
  if(process.argv.includes('--require-production'))throw Error('v177 production integration not verified');
  console.log(process.argv.includes('--json')?JSON.stringify(result,null,2):`v177: ${result.indexedTotal}/185 source-reviewed; NOT production verified`);
 }catch(e){console.error(e.stack);process.exitCode=1;}
}
