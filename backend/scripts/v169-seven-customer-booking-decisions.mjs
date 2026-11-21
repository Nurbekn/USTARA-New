// v169: source evidence for original #95–#101. Audit is NOT production readiness.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditSevenPortfolio} from './v168-seven-portfolio-decisions.mjs';
import {assertEvidenceFile,auditCriticalDecisions} from './v155-critical-decisions.mjs';
import {summarizeDecisions,parseCsv} from './v153-decision-progress.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const spec=(id,title,code,tests,gap)=>({id,title,code,tests,gap});
export const SEVEN=Object.freeze([
 spec(95,'2-3 sartarosh solishtirish',
  [['frontend/src/pages/user/explore/compareModel.js','visibleCompareIds'],['frontend/src/pages/user/explore/ComparisonPanel.jsx','ComparisonPanel']],
  [['frontend/test/v132BarberComparison.test.js','test(']],
  '2–3 barber comparison exists, but live API price/availability consistency and mobile browser E2E NOT VERIFIED.'),
 spec(96,'Alohida kun yoki xizmat bronini pauza qilish',
  [['backend/controllers/calendarExceptionsController.js','barber_calendar_exceptions'],['backend/controllers/barbersController.js','accepting_bookings']],
  [['backend/test/calendarExceptions.unit.test.js','test(']],
  'Date closures/global barber acceptance exist. Service-specific pause controls and live DB conflict behavior NOT VERIFIED.'),
 spec(97,'Favorites va kuzatish',
  [['backend/controllers/socialController.js','social_follows'],['frontend/src/pages/user/UserHome.jsx','following']],
  [['frontend/test/v131FollowedHomeSafety.test.js','test(']],
  'Follow and saved-social-post foundations exist. Distinct favorite service collections and cross-device E2E NOT VERIFIED.'),
 spec(98,'Besh daqiqalik bron qoralamasi',
  [['frontend/src/pages/user/barber/bookingDraft.js','DRAFT_TTL_MS'],['frontend/src/pages/user/barber/InlineBooking.jsx','BookingDraft']],
  [['frontend/test/v83GuestBookingDraft.test.js','test(']],
  'TTL-bound guest draft exists, not a reserved slot. Real signup/login recovery browser E2E NOT VERIFIED.'),
 spec(99,'Bir sahifali progressiv booking',
  [['frontend/src/pages/user/barber/InlineBooking.jsx','InlineBooking'],['frontend/src/pages/user/barber/createBooking.js','createBooking']],
  [['frontend/test/createBooking.test.js','test(']],
  'Single-page service/date/time flow exists. Full mobile accessibility and live availability E2E NOT VERIFIED.'),
 spec(100,'Server tasdig‘i bilan bron yakuniy oynasi',
  [['frontend/src/pages/user/barber/bookingConfirmation.js','confirm'],['frontend/src/pages/user/barber/bookingReceipt.js','verifyBookingReceipt']],
  [['frontend/test/v86BookingReceiptIntegrity.test.js','test(']],
  'Server-verified booking receipts and ambiguous-response handling exist; real transactional PostgreSQL/browser E2E NOT VERIFIED.'),
 spec(101,'Mijoz kechikishni xabar qilish',
  [['backend/controllers/bookingLateNoticeV169.js','FOR UPDATE'],['frontend/src/pages/user/bookings/LateNoticeV169.jsx','sendLateNotice'],['frontend/src/pages/barber/components/BookingCard.jsx','booking.lateNotice']],
  [['backend/test/v169BookingLateNotice.unit.test.js',"test('#101"],['frontend/test/v169LateArrivalNotice.test.js',"test('#101"]],
  'New persistent single-notice flow and barber booking-card read; no guaranteed push/Telegram delivery, explicit acceptance, real PostgreSQL concurrency or browser E2E.'),
]);
export function auditSevenCustomerBooking({projectRoot=ROOT,registryPath=path.join(ROOT,'docs/USTARA_185_NAZORAT.csv')}={}){
 const prev=auditSevenPortfolio({projectRoot,registryPath});
 if(prev.uniqueSourceTraces!==96)throw Error('v169 expected 96 prior source traces');
 const summary=summarizeDecisions(registryPath);
 if(prev.registrySha256!==summary.sha256)throw Error('v169 registry changed');
 const critical=auditCriticalDecisions({projectRoot,registryPath});
 const already=new Set([...critical.decisions.map(d=>d.id),...prev.decisions.map(d=>d.id)]);
 const rows=parseCsv(fs.readFileSync(registryPath,'utf8').replace(/^\ufeff/,''));
 const decisions=SEVEN.map(item=>{
  if(rows[item.id]?.[0]!==String(item.id)||rows[item.id]?.[1]!==item.title)
   throw Error(`v169 registry decision ${item.id} changed`);
  const code=item.code.map(([file,token])=>assertEvidenceFile(projectRoot,file,token).path);
  const tests=item.tests.map(([file,token])=>assertEvidenceFile(projectRoot,file,token).path);
  return {id:item.id,decision:item.title,originalStatus:rows[item.id][3],code,tests,
   sourceStatus:already.has(item.id)?'ALREADY_INDEXED_PARTIAL':'PARTIAL_SOURCE_GAP',
   missingImplementation:[item.gap],productionVerified:false};
 });
 const alreadyIndexed=decisions.filter(d=>already.has(d.id)).map(d=>d.id);
 const newSourceTraces=decisions.length-alreadyIndexed.length;
 return {version:'v169',totalDecisions:185,registrySha256:summary.sha256,reviewedDecisions:7,
 previousSourceTraces:96,alreadyIndexed,newSourceTraces,uniqueSourceTraces:96+newSourceTraces,
 notYetTraced:185-(96+newSourceTraces),decisions,originalCounts:summary.counts,
 postgresE2E:'NOT_RUN',browserE2E:'NOT_RUN',telegramLateArrival:'NOT_IMPLEMENTED',
 productionReady:false,releaseReadiness:'NOT_VERIFIED'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const r=auditSevenCustomerBooking();
 if(process.argv.includes('--require-production'))throw Error('v169 production NOT VERIFIED');
 console.log(process.argv.includes('--json')?JSON.stringify(r,null,2):`v169: reviewed ${r.reviewedDecisions}, new ${r.newSourceTraces}, unique ${r.uniqueSourceTraces}/185; production NOT VERIFIED`);
 }catch(e){console.error(e.message);process.exitCode=1;}
}
