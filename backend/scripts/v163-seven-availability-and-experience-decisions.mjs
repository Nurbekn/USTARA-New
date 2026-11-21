// v163 / #53–#59: exact original decisions with PARTIAL evidence, never production certification.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditBadgesSeven} from './v162-seven-evidence-and-safety-decisions.mjs';
import {parseCsv,summarizeDecisions} from './v153-decision-progress.mjs';
import {assertEvidenceFile} from './v155-critical-decisions.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const spec=(id,title,code,tests,gap)=>({id,title,code,tests,gap});
export const NEXT_SEVEN=Object.freeze([
 spec(53,'Xavfsiz bronlarni avtomatik tasdiqlash',
  [['backend/services/multiBooking.js',"'confirmed'"],['backend/controllers/bookingsController.js',"'confirmed'"]],
  [['backend/test/bookingPriceSnapshot.unit.test.js','narx o‘zgarib ketganda']],
  'Auto-confirm sources exist, but actual PostgreSQL concurrency/idempotency E2E and full no-conflict policy not verified.'),
 spec(54,'Sartarosh kela olmasa muqobil takliflar',
  [['frontend/src/pages/user/bookings/cancellationAlternatives.js','alternativeBarbersDiscoveryUrl'],['frontend/src/pages/user/bookings/CancellationAlternatives.jsx','Boshqa sartaroshlarni izlash']],
  [['frontend/test/v163OfflineAndAlternatives.test.js','only for terminal cancelled/rejected'],['frontend/test/v101CancellationAlternatives.test.js','same barber']],
  'Discovery after cancelled/rejected booking is possible without silent transfer. A barber-absence-triggered workflow, notification and verified equivalent alternatives are NOT IMPLEMENTED.'),
 spec(55,'Ta’til va bronlar himoyasi',
  [['backend/controllers/calendarExceptionsController.js','existing_booking_conflict'],['backend/services/calendarSchedule.js','ustara_effective_day_schedule']],
  [['backend/test/calendarExceptions.unit.test.js','calendar changes cannot erase existing confirmed booking']],
  'Confirmed booking blocks vacation-calendar update in mock-tested transaction; real parallel PostgreSQL schedule changes NOT RUN.'),
 spec(56,'Tasdiqlangan bron narxi o‘zgarmaydi',
  [['backend/services/bookingSelection.js','attachBookingServices'],['backend/services/multiBooking.js','totalPrice']],
  [['backend/test/bookingPriceSnapshot.unit.test.js','eski nom va saqlangan narxni']],
  'Price/service snapshot tested at source level. Legacy paths, full address snapshot (#52), database E2E and production verification remain open.'),
 spec(57,'Sartarosh aksiyalari va natijalari',
  [['backend/controllers/adminPromotions.js','barber_promotions'],['frontend/src/pages/user/UserHome.jsx','uh-sponsored-label']],
  [['backend/test/promotions.unit.test.js','Promotion requires valid hours']],
  'Admin-paid placement is NOT a barber-created service discount or an outcomes dashboard. Barber campaigns, redemption/results and analytics are NOT IMPLEMENTED.'),
 spec(58,'Mobilga mos qoramtir ko‘k dizayn',
  [['frontend/src/index.css','--bg: #0b1120'],['frontend/src/mobile.css','@media'],['frontend/src/components/ConnectionNoticeV163.css','@media']],
  [['frontend/test/v163OfflineAndAlternatives.test.js','global connection banner']],
  'Dark blue/mobile styles have source evidence. Visual browser, screen reader, contrast, keyboard and device matrix E2E NOT RUN.'),
 spec(59,'Loading xatolik va offline kesh',
  [['frontend/src/components/Loading.jsx','app-loading'],['frontend/src/components/AppErrorBoundary.jsx','getDerivedStateFromError'],['frontend/src/components/ConnectionNoticeV163.jsx',"addEventListener('offline'"],['frontend/src/api/client.js','cache: "no-store"']],
  [['frontend/test/v163OfflineAndAlternatives.test.js','offline and reconnect are distinct']],
  'Offline/connectivity UX is a device hint; private API data is never cached or auto-replayed. Offline app shell/service-worker cache and browser E2E NOT IMPLEMENTED.'),
]);
export function auditAvailabilitySeven({projectRoot=ROOT,registryPath=path.join(ROOT,'docs/USTARA_185_NAZORAT.csv')}={}){
 const previous=auditBadgesSeven({projectRoot,registryPath});
 if(previous.uniqueSourceTraces!==56)throw Error('v163 previous trace count mismatch; NOT VERIFIED');
 const summary=summarizeDecisions(registryPath);
 if(previous.registrySha256!==summary.sha256)throw Error('v163 original decision registry checksum mismatch; NOT VERIFIED');
 const rows=parseCsv(fs.readFileSync(registryPath,'utf8').replace(/^\ufeff/,''));
 const seen=new Set();
 const decisions=NEXT_SEVEN.map(s=>{
  if(seen.has(s.id)||rows[s.id]?.[0]!==String(s.id)||rows[s.id]?.[1]!==s.title) throw Error('v163 source decision mismatch/duplicate; NOT VERIFIED');
  seen.add(s.id);
  const code=s.code.map(([file,needle])=>assertEvidenceFile(projectRoot,file,needle).path);
  const tests=s.tests.map(([file,needle])=>assertEvidenceFile(projectRoot,file,needle).path);
  return {id:s.id,decision:s.title,originalStatus:rows[s.id][3],code,tests,
   sourceStatus:'PARTIAL_SOURCE_GAP',missingImplementation:[s.gap],productionVerified:false};
 });
 if(seen.size!==7||previous.uniqueSourceTraces+7!==63)throw Error('v163 unique count mismatch; NOT VERIFIED');
 return {version:'v163',totalDecisions:185,registrySha256:summary.sha256,
  previousSourceTraces:56,newSourceTraces:7,uniqueSourceTraces:63,notYetTraced:122,decisions,
  knownGaps:[...previous.knownGaps,...decisions.map(d=>({id:d.id,missingImplementation:d.missingImplementation}))],
  originalCounts:summary.counts,postgresE2E:'NOT_RUN',browserE2E:'NOT_RUN',telegramE2E:'NOT_RUN',
  releaseReadiness:'NOT_VERIFIED',productionReady:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=auditAvailabilitySeven();if(process.argv.includes('--require-production'))throw Error('v163 DB/browser E2E NOT VERIFIED');
  console.log(process.argv.includes('--json')?JSON.stringify(result,null,2):`v163: ${result.uniqueSourceTraces}/185 source references, production NOT VERIFIED`);
 }catch(error){console.error(error.message);process.exitCode=1;}
}
