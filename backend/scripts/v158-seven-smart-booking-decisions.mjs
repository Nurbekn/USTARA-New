// v158: review original Smart Booking decisions #17–#23 against source/tests.
// Source references are NOT proof of end-to-end feature completeness.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditPublicSeven} from './v157-seven-public-decisions.mjs';
import {assertEvidenceFile} from './v155-critical-decisions.mjs';
import {parseCsv,summarizeDecisions} from './v153-decision-progress.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const entry=(id,title,code,tests,missingImplementation=[])=>Object.freeze({id,title,code,tests,missingImplementation});
export const NEXT_SEVEN=Object.freeze([
 entry(17,'Sartarosh belgilagan bekor qilish qoidalari',
  [['backend/controllers/cancellationPolicyController.js','cancellation_cutoff_minutes'],['backend/services/cancellationTerms.js','cancellation_policy_changed']],
  [['backend/test/cancellationPolicy.unit.test.js','test('],['backend/test/cancellationTerms.unit.test.js','test(']]),
 entry(18,'Smart Booking eslatma va kechikish',
  [['backend/services/smartBookingOffers.js','async function transaction'],['backend/services/telegramBookingNotifications.js',"status === 'confirmed'"]],
  [['backend/test/smartBookingOffers.unit.test.js','test('],['backend/test/bookingNotificationAfterCommit.unit.test.js','test(']],
  ['Bron boshlanishidan oldin avtomatik mijoz eslatmasi va kechikish holati E2E tasdiqlanmagan.']),
 entry(19,'Bo‘shagan vaqt taklifi 5 daqiqa amal qiladi',
  [['backend/services/smartBookingOffers.js',"clock_timestamp()+interval '5 minutes'"],['frontend/src/pages/queue/manualQueueModel.js','offerActionState']],
  [['backend/test/smartBookingOffers.unit.test.js','test('],['frontend/test/offerActionStateV45.test.js','test(']]),
 entry(20,'Takliflar ketma-ket mos mijozga yuboriladi',
  [['backend/services/smartBookingOffers.js','ORDER BY q.queue_position ASC NULLS LAST'],['backend/services/queueOfferLifecycle.js','cancelUnconfirmedQueueOffers']],
  [['backend/test/smartBookingOffers.unit.test.js','test('],['backend/test/v46QueueLifecycle.unit.test.js','test(']]),
 entry(21,'Takliflar bugungi jadvalda ko‘rinadi',
  [['backend/services/smartBookingOffers.js','async function listForBarber'],['frontend/src/pages/barber/components/TodaySmartBookingOffersV158.jsx','parseTodaySmartBookingOffers']],
  [['backend/test/v158TodaySmartBookingOffers.unit.test.js','test('],['frontend/test/v158TodaySmartBookingOffers.test.js','test(']]),
 entry(22,'Xizmat tugagach vaqtni qayta taqsimlash',
  [['backend/services/bookingStatusService.js','status === "completed"'],['backend/database/migrations/20261208_smart_booking_offers.sql',"NEW.status='cancelled'"]],
  [['backend/test/v38BookingLifecycle.unit.test.js','test('],['backend/test/smartBookingOffers.unit.test.js','test(']],
  ['Hozirgi avtomatik Smart Booking opening trigger faqat cancellation uchun; xizmat erta yakunlanganda qolgan vaqtni taklif qilish implementatsiyasi aniqlanmadi.']),
 entry(23,'Keldi Boshladi Tugadi va kelmadi holatlari',
  [['backend/controllers/walkinQueueController.js',"status='in_service'"],['frontend/src/pages/barber/Queue.jsx','finishIntent']],
  [['backend/test/v95QueueServiceStarted.unit.test.js','test('],['frontend/test/v100ServiceFinishConfirmation.test.js','test(']]),
]);
export function auditSmartSeven({projectRoot=ROOT,registryPath=path.join(ROOT,'docs/USTARA_185_NAZORAT.csv')}={}){
 const summary=summarizeDecisions(registryPath);
 const prev=auditPublicSeven({projectRoot,registryPath});
 const already=new Set([5,6,27,75,76,107,165,1,2,3,4,7,8,9,
   ...prev.decisions.map(x=>x.id)]);
 if(prev.uniqueSourceTraces!==21||already.size!==21)throw Error('v158: prior source coverage not coherent; NOT VERIFIED');
 const rows=parseCsv(fs.readFileSync(registryPath,'utf8').replace(/^\ufeff/,''));
 const seen=new Set();
 const decisions=NEXT_SEVEN.map(spec=>{
  if(already.has(spec.id)||seen.has(spec.id)||rows[spec.id]?.[0]!==String(spec.id)||rows[spec.id]?.[1]!==spec.title)
   throw Error('v158: duplicated or modified original decision; NOT VERIFIED');
  seen.add(spec.id);
  const code=spec.code.map(([filename,needle])=>assertEvidenceFile(projectRoot,filename,needle).path);
  const tests=spec.tests.map(([filename,needle])=>assertEvidenceFile(projectRoot,filename,needle).path);
  if(code.length<2||tests.length<1||code.some(p=>tests.includes(p)))
   throw Error('v158: source/test coverage too small; NOT VERIFIED');
  return {id:spec.id,decision:spec.title,originalStatus:rows[spec.id][3],code,tests,
    sourceStatus:spec.missingImplementation.length?'PARTIAL_SOURCE_GAP':'REFERENCES_PRESENT_ONLY',
    missingImplementation:[...spec.missingImplementation],productionVerified:false};
 });
 return {version:'v158',totalDecisions:185,registrySha256:summary.sha256,
  previousSourceTraces:already.size,newSourceTraces:decisions.length,
  uniqueSourceTraces:already.size+decisions.length,notYetTraced:185-already.size-decisions.length,
  decisions,originalCounts:summary.counts,
  knownGaps:decisions.filter(d=>d.missingImplementation.length).map(d=>({id:d.id,missingImplementation:d.missingImplementation})),
  todayOffersView:'UNIT_TESTED_ONLY',postgresE2E:'NOT_RUN',browserE2E:'NOT_RUN',telegramE2E:'NOT_RUN',
  releaseReadiness:'NOT_VERIFIED',productionReady:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const report=auditSmartSeven();
  if(process.argv.includes('--require-production'))throw Error('v158: cannot verify PostgreSQL, Chrome or Telegram E2E; NOT VERIFIED');
  console.log(process.argv.includes('--json')?JSON.stringify(report,null,2):
   `v158: ${report.uniqueSourceTraces}/185 source refs, ${report.knownGaps.length} known implementation gaps; production NOT VERIFIED.`);
 }catch(error){console.error(error.message);process.exitCode=1;}
}
