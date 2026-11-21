// v160: seven new original decision references; no claim of runtime certification.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditQueueSeven} from './v159-seven-queue-decisions.mjs';
import {parseCsv,summarizeDecisions} from './v153-decision-progress.mjs';
import {assertEvidenceFile} from './v155-critical-decisions.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const spec=(id,title,code,tests,gap)=>({id,title,code,tests,gap});
export const NEXT_SEVEN=Object.freeze([
 spec(32,'Navbatni qo‘lda o‘zgartirish',
  [['backend/controllers/walkinQueueController.js','async function reorder(req,res)'],['frontend/src/pages/barber/Queue.jsx','expected_order:order']],
  [['backend/test/queueReorderAdminQr.unit.test.js','test(']],'Manual reorder real PostgreSQL parallel execution and barber browser E2E not verified.'),
 spec(33,'Navbat tartibi sababi va audit',
  [['backend/database/migrations/20261206_queue_order_qr_settings.sql','walkin_queue_reorder_events'],['backend/controllers/walkinQueueController.js','INSERT INTO walkin_queue_reorder_events']],
  [['backend/test/queueReorderAdminQr.unit.test.js','test(']],'Transactional audit real database rollback and review UI not verified.'),
 spec(34,'Ish kunining oxirida navbat himoyasi',
  [['backend/controllers/walkinQrController.js','barber_day_closures'],['backend/controllers/walkinQrController.js','Ish vaqti tugagan.']],
  [['backend/test/walkinQr.unit.test.js','test(']],'Real timezone/midnight and concurrency database coverage remains incomplete.'),
 spec(35,'Mijozga navbat soni va taxminiy vaqt',
  [['backend/controllers/queuePublicController.js','new_arrival_estimate'],['frontend/src/pages/user/barber/PublicQueueSummary.jsx','new_arrival_estimate']],
  [['backend/test/v90PublicQueueEstimate.unit.test.js','test(']],'Public estimates are approximate; real database and mobile-browser timing not verified.'),
 spec(36,'Vertikal rangli bron timeline',
  [['frontend/src/pages/barber/components/BookingDayTimelineV160.jsx','buildBookingTimeline'],['frontend/src/pages/barber/data/bookingTimelineV160.js','buildBookingTimeline'],['frontend/src/pages/barber/components/booking-day-timeline-v160.css','bx-booking-timeline-item']],
  [['frontend/test/v160BookingDayTimeline.test.js','test(']],'Read-only day timeline is unit-tested; real authenticated browser/mobile E2E is not verified.'),
 spec(37,'Bronlarim kelajak va tarix',
  [['frontend/src/pages/user/Bookings.jsx',"['all', 'upcoming', 'history'"],['frontend/src/pages/user/bookings/model.js',"filter === 'history'"]],
  [['frontend/test/customerBookings.test.js','test(']],'Customer bookings filtering works in sources; live DB and browser E2E not verified.'),
 spec(38,'Kuzatilgan sartaroshlar Home boshida',
  [['frontend/src/pages/user/UserHome.jsx','sections.topFollowing'],['frontend/src/pages/user/explore/homeModel.js','verifiedHomeFollowing']],
  [['frontend/test/v131FollowedHomeSafety.test.js','test(']],'Followed-barber ranking lacks full authenticated browser E2E.'),
]);
export function auditTimelineSeven({projectRoot=ROOT,registryPath=path.join(ROOT,'docs/USTARA_185_NAZORAT.csv')}={}){
 const prev=auditQueueSeven({projectRoot,registryPath});
 if(prev.uniqueSourceTraces!==35)throw Error('v160 previous source index unexpected; NOT VERIFIED');
 const summary=summarizeDecisions(registryPath);
 if(summary.sha256!==prev.registrySha256)throw Error('v160 original decision registry changed; NOT VERIFIED');
 const rows=parseCsv(fs.readFileSync(registryPath,'utf8').replace(/^\ufeff/,''));
 const ids = new Set();
 const decisions=NEXT_SEVEN.map(s=>{
  if(ids.has(s.id)||prev.decisions.some(d=>d.id===s.id) || rows[s.id]?.[0]!==String(s.id)||rows[s.id]?.[1]!==s.title)
   throw Error('v160 original decisions changed/duplicated; NOT VERIFIED');
  ids.add(s.id);
  const code=s.code.map(([file,needle])=>assertEvidenceFile(projectRoot,file,needle).path);
  const tests=s.tests.map(([file,needle])=>assertEvidenceFile(projectRoot,file,needle).path);
  return {id:s.id,decision:s.title,originalStatus:rows[s.id][3],code,tests,
   sourceStatus:'PARTIAL_SOURCE_GAP',missingImplementation:[s.gap],productionVerified:false};
 });
 if(ids.size!==7||prev.uniqueSourceTraces+ids.size!==42)throw Error('v160 invalid unique count; NOT VERIFIED');
 return {version:'v160',totalDecisions:185,registrySha256:summary.sha256,
  previousSourceTraces:35,newSourceTraces:7,uniqueSourceTraces:42,notYetTraced:143,
  decisions,knownGaps:[...prev.knownGaps,...decisions.map(d=>({id:d.id,missingImplementation:d.missingImplementation}))],
  originalCounts:summary.counts,postgresE2E:'NOT_RUN',browserE2E:'NOT_RUN',telegramE2E:'NOT_RUN',
  releaseReadiness:'NOT_VERIFIED',productionReady:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=auditTimelineSeven();
  if(process.argv.includes('--require-production'))throw Error('v160 real DB and browser E2E NOT VERIFIED');
  console.log(process.argv.includes('--json')?JSON.stringify(result,null,2):`v160: ${result.uniqueSourceTraces}/185 source traces; production NOT VERIFIED.`);
 }catch(error){console.error(error.message);process.exitCode=1;}
}
