// Final source-trace review of the ORIGINAL 185 decisions. Not a production certification.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditSevenFinalSafetyDecisions} from './v180-seven-final-safety-decisions.mjs';
import {assertEvidenceFile} from './v155-critical-decisions.mjs';
import {parseCsv,summarizeDecisions} from './v153-decision-progress.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const SPECS=Object.freeze([
 {id:179,title:'Private Booking Note',status:'NOT_IMPLEMENTED',
  gap:'Private note with role-based read/write access, explicit visibility rules, safe retention and PostgreSQL/HTTP verification is not implemented. No private note is stored in the five-minute guest draft.'},
 {id:180,title:'Xizmat davomiyligi 5 daqiqalik qadam',status:'PARTIAL_SOURCE_GAP',
  code:[['backend/controllers/servicesController.js','durationMinutes % 5 !== 0'],['backend/services/slotGrid.js','STEP_MINUTES = 5']],
  tests:[['backend/test/v181SevenFinalDecisions.unit.test.js',"test('#180"]],
  gap:'Service creation and availability enforce five-minute steps. Legacy stored values and real PostgreSQL are not verified end to end.'},
 {id:181,title:'Butun shop pauzasi HOZIRCHA KERAK EMAS',status:'CANCELLED_BY_USER',
  gap:'Shop-wide pause was explicitly postponed; no additional workflow is added.'},
 {id:182,title:'Profil preview takroriy savol BEKOR',status:'CANCELLED_BY_USER',
  gap:'Extra profile preview re-discussion was cancelled; no duplicate preview flow is added.'},
 {id:183,title:'Offline amalning oddiy saqlash holati',status:'PARTIAL_SOURCE_GAP',
  code:[['frontend/src/pages/user/barber/bookingDraft.js','readBookingDraft(storage, now)'],['frontend/src/pages/user/barber/bookingDraftStatusV181.js','persistBookingSelectionV181'],['frontend/src/pages/user/barber/InlineBooking.jsx','draftSaveState.kind']],
  tests:[['frontend/test/v181OfflineDraftSaveStatus.test.js',"test('#183"]],
  gap:'Saved/failed/expired status is shown for a five-minute browser-tab selection; no offline booking mutation, durable cross-device sync or live browser validation is claimed.'},
 {id:184,title:'Faqat ochilgan slotlarga bron, kun limiti yo‘q',status:'PARTIAL_SOURCE_GAP',
  code:[['backend/services/slotGrid.js','const slots = []'],['backend/controllers/bookingsController.js','slotCandidates({ workStart, workEnd, duration, nowMinutes, busy })']],
  tests:[['backend/test/v181SevenFinalDecisions.unit.test.js',"test('#184"]],
  gap:'Slot generation is based on working hours and conflicts rather than a fixed daily booking quota. Runtime scheduling, PostgreSQL locks and booking E2E are not verified.'},
 {id:185,title:'Slot barcha mijozlar uchun ochiq',status:'PARTIAL_SOURCE_GAP',
  code:[['backend/routes/bookings.js','router.get("/available-slots",getAvailableSlots)'],['backend/controllers/bookingsController.js','slots: formattedSlots']],
  tests:[['backend/test/v181SevenFinalDecisions.unit.test.js',"test('#185"]],
  gap:'The public availability endpoint shows eligible free slots to guests/customers; booking creation still requires an authenticated customer and server conflict checks. Real multi-user contention E2E not run.'},
]);
export function auditSevenFinalDecisions({projectRoot=ROOT,registryPath=path.join(ROOT,'docs/USTARA_185_NAZORAT.csv')}={}) {
 const prior=auditSevenFinalSafetyDecisions({projectRoot,registryPath});
 if(prior.indexedTotal!==179)throw Error('v181 requires 179 previously source-reviewed decisions');
 const summary=summarizeDecisions(registryPath);
 if(prior.registrySha256!==summary.sha256)throw Error('Canonical 185-decision registry changed');
 const rows=parseCsv(fs.readFileSync(registryPath,'utf8').replace(/^\ufeff/,''));
 const decisions=SPECS.map(spec=>{
  if(rows[spec.id]?.[0]!==String(spec.id) || rows[spec.id]?.[1]!==spec.title)
   throw Error(`Decision #${spec.id} differs from canonical registry`);
  return {id:spec.id,decision:spec.title,originalStatus:rows[spec.id][3],sourceStatus:spec.status,
   code:(spec.code||[]).map(([rel,needle])=>assertEvidenceFile(projectRoot,rel,needle).path),
   tests:(spec.tests||[]).map(([rel,needle])=>assertEvidenceFile(projectRoot,rel,needle).path),
   missingImplementation:[spec.gap],productionVerified:false};
 });
 return {version:'v181',registrySha256:summary.sha256,totalDecisions:185,reviewedDecisions:7,
  previouslyIndexed:179,indexedNew:7,indexedTotal:185,notYetIndexed:0,
  sourcePartiallyImplemented:decisions.filter(x=>x.sourceStatus==='PARTIAL_SOURCE_GAP').length,
  requirementsNotImplemented:decisions.filter(x=>x.sourceStatus==='NOT_IMPLEMENTED').length,
  explicitlyCancelled:decisions.filter(x=>x.sourceStatus==='CANCELLED_BY_USER').length,
  decisions,postgresE2E:'NOT_RUN',browserE2E:'NOT_RUN',telegramE2E:'NOT_RUN',productionReady:false};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 try {
  const result=auditSevenFinalDecisions();
  if(process.argv.includes('--require-production')) throw Error('Production E2E and gap closure are not complete');
  console.log(process.argv.includes('--json')?JSON.stringify(result,null,2):`v181: ${result.indexedTotal}/185 decisions SOURCE REVIEWED; production NOT_VERIFIED`);
 }catch(err) {console.error(err.stack);process.exitCode=1;}
}
