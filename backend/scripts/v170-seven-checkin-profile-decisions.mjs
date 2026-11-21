// v170: read-only source evidence for #102–#108, not runtime verification.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditSevenCustomerBooking} from './v169-seven-customer-booking-decisions.mjs';
import {auditCriticalDecisions,assertEvidenceFile} from './v155-critical-decisions.mjs';
import {summarizeDecisions,parseCsv} from './v153-decision-progress.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const item=(id,title,code,tests,gap)=>({id,title,code,tests,gap});
export const SEVEN=Object.freeze([
 item(102,'Mijoz check-in, sartarosh tasdig‘i',
  [['backend/controllers/bookingCheckInV170.js','FOR UPDATE'],['frontend/src/pages/user/bookings/CheckInV170.jsx','mutateCheckIn'],['frontend/src/pages/barber/components/BookingCard.jsx','confirmArrival']],
  [['backend/test/v170BookingCheckIn.unit.test.js',"test('#102"],['frontend/test/v170BookingCheckIn.test.js',"test('#102"]],
  'Two-step server check-in added; real DB concurrent cancellation, live mobile browser and real notifications NOT VERIFIED.'),
 item(103,'Ixcham Smart Service Card',
  [['frontend/src/pages/user/barber/InlineBooking.jsx','serviceIds'],['frontend/src/pages/user/barber/availableSlots.js','loadAvailableSlots']],
  [['frontend/test/v77BookingQuote.test.js','test(']],
  'Service summaries exist inside booking UI, but dedicated compact smart card design, usability and mobile E2E NOT VERIFIED.'),
 item(104,'Professional Finish Flow',
  [['frontend/src/pages/barber/components/BookingCard.jsx','NEEDS_CONFIRM'],['backend/controllers/bookingsController.js','refreshStatus']],
  [['frontend/test/v100ServiceFinishConfirmation.test.js','test('],['backend/test/v87BookingStatusCommit.unit.test.js','test(']],
  'Explicit service completion confirmation exists, but professional end-to-end finish and verified receipt E2E NOT VERIFIED.'),
 item(105,'Bekor qilishdan keyin muqobil vaqtlari',
  [['frontend/src/pages/user/bookings/CancellationAlternatives.jsx','alternativeBookingUrl'],['frontend/src/pages/user/bookings/cancellationAlternatives.js','collectCancellationAlternatives']],
  [['frontend/test/v101CancellationAlternatives.test.js','test(']],
  'Read-only suggestions exist; no slot reservation, fresh PostgreSQL availability and mobile E2E NOT VERIFIED.'),
 item(106,'Xavfsiz bronni ko‘chirish',
  [['backend/controllers/bookingsController.js','modifyBooking'],['frontend/src/pages/user/bookings/model.js','rescheduleCustomerBooking']],
  [['frontend/test/v103RescheduleSlotBoundary.test.js','test(']],
  'Revision/quote guards exist; concurrent PostgreSQL writes and browser E2E NOT VERIFIED.'),
 item(107,'Ommaviy profil havolasini ko‘rish',
  [['frontend/src/pages/user/barber/publicShare.js','canonicalPublicBarberUrl'],['frontend/src/pages/user/barber/PublicProfileShare.jsx','sharePublicBarberProfile']],
  [['frontend/test/v136ShareBasePath.test.js','test(']],
  'Already indexed in v155. Public numeric-ID links exist; real deployment and sharing E2E NOT VERIFIED.'),
 item(108,'Shaxsiy ustara.uz/@username havola',
  [['frontend/src/pages/user/barber/publicShare.js','canonicalPublicBarberUrl'],['frontend/src/pages/barber/Portfolio.jsx','username']],
  [['frontend/test/v134PublicProfileSharing.test.js','test(']],
  'NOT IMPLEMENTED: current canonical URLs are /barbers/:id, not /@username. Reserved names, uniqueness, migration and public slug route remain open.'),
]);
export function auditSevenCheckinProfile({projectRoot=ROOT,registryPath=path.join(ROOT,'docs/USTARA_185_NAZORAT.csv')}={}){
 const prev=auditSevenCustomerBooking({projectRoot,registryPath});
 if(prev.uniqueSourceTraces!==103)throw Error('v170 expected 103 prior source traces');
 const summary=summarizeDecisions(registryPath);
 if(prev.registrySha256!==summary.sha256)throw Error('v170 registry changed');
 const critical=auditCriticalDecisions({projectRoot,registryPath});
 const already=new Set([...prev.decisions.map(d=>d.id),...critical.decisions.map(d=>d.id)]);
 const records=parseCsv(fs.readFileSync(registryPath,'utf8').replace(/^\ufeff/,''));
 const decisions=SEVEN.map(d=>{
  if(records[d.id]?.[0]!==String(d.id)||records[d.id]?.[1]!==d.title)throw Error(`v170 decision #${d.id} registry mismatch`);
  const code=d.code.map(([file,token])=>assertEvidenceFile(projectRoot,file,token).path);
  const tests=d.tests.map(([file,token])=>assertEvidenceFile(projectRoot,file,token).path);
  return {id:d.id,decision:d.title,originalStatus:records[d.id][3],code,tests,
   sourceStatus:already.has(d.id)?'ALREADY_INDEXED_PARTIAL':d.id===108?'NOT_IMPLEMENTED':'PARTIAL_SOURCE_GAP',
   missingImplementation:[d.gap],productionVerified:false};
 });
 const alreadyIndexed=decisions.filter(d=>already.has(d.id)).map(d=>d.id);
 const newSourceTraces=decisions.length-alreadyIndexed.length;
 return {version:'v170',totalDecisions:185,registrySha256:summary.sha256,reviewedDecisions:7,
   previousSourceTraces:prev.uniqueSourceTraces,alreadyIndexed,newSourceTraces,
   uniqueSourceTraces:prev.uniqueSourceTraces+newSourceTraces,
   notYetTraced:185-prev.uniqueSourceTraces-newSourceTraces,decisions,
   originalCounts:summary.counts,postgresE2E:'NOT_RUN',browserE2E:'NOT_RUN',telegramCheckIn:'NOT_IMPLEMENTED',productionReady:false,releaseReadiness:'NOT_VERIFIED'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const r=auditSevenCheckinProfile();
  if(process.argv.includes('--require-production'))throw Error('v170 production NOT VERIFIED');
  console.log(process.argv.includes('--json')?JSON.stringify(r,null,2):`v170: reviewed 7, new ${r.newSourceTraces}, unique ${r.uniqueSourceTraces}/185; production NOT VERIFIED`);
 }catch(e){console.error(e.message);process.exitCode=1;}
}
