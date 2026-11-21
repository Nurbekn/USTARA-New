// v174: source review, NOT production verification or a delivery-event history.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditSevenShopQueue} from './v173-seven-shop-queue-decisions.mjs';
import {assertEvidenceFile} from './v155-critical-decisions.mjs';
import {parseCsv,summarizeDecisions} from './v153-decision-progress.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const SPECS=Object.freeze([
 {id:130,title:'Boshqa sartaroshga rozilik bilan transfer',status:'NOT_IMPLEMENTED',gap:'No authenticated customer consent workflow, source and destination barber lock, or atomic cross-barber transfer exists. Do not silently replace a booked barber.'},
 {id:131,title:'Smart Notification Center',status:'PARTIAL_SOURCE_GAP',code:[['frontend/src/pages/user/bookings/smartNotificationCenterV174.js','buildSmartNotificationCenterV174'],['frontend/src/layouts/UserLayout.jsx','subscribeSession'],['frontend/src/pages/user/bookings/notifications.js','bookingStatusItems']],tests:[['frontend/test/v174SmartNotificationCenter.test.js',"test('#131"]],gap:'Read-only booking status snapshot with active/past filters and refresh. No persisted notification read state, Telegram outbox delivery timeline, push stream or browser E2E.'},
 {id:132,title:'Faqat slot bo‘shasa bildirish waitlist',status:'PARTIAL_SOURCE_GAP',code:[['backend/services/smartBookingOffers.js','smart_booking_offers'],['backend/database/migrations/20261208_smart_booking_offers.sql','smart_booking']],tests:[['backend/test/queueOfferConsent.unit.test.js','test(']],gap:'Queue offer/opt-in foundation exists. User subscription to a specific unavailable slot and real PG/Telegram E2E not verified.'},
 {id:133,title:'Smart Booking History',status:'PARTIAL_SOURCE_GAP',code:[['frontend/src/pages/user/Bookings.jsx',"['all', 'upcoming', 'history'"],['frontend/src/pages/user/bookings/model.js','history: []']],tests:[['frontend/test/bookingNotifications.test.js','test(']],gap:'Customer booked/past status list exists, but true immutable Smart Booking decision events, delivery outcomes and status history are not exposed.'},
 {id:134,title:'Privacy Center',status:'NOT_IMPLEMENTED',gap:'No cohesive privacy data/export/deletion/permission center verified. Account deactivation is a separate function, not a full privacy center.'},
 {id:135,title:'Akkauntni vaqtincha faolsizlantirish',status:'PARTIAL_SOURCE_GAP',code:[['backend/routes/auth.js',"'/account/deactivate'"],['frontend/src/components/DeactivateAccountAction.jsx','DeactivateAccountAction']],tests:[['backend/test/accountPause.unit.test.js','test(']],gap:'Password-backed temporary deactivation and session controls have source tests; real PostgreSQL/queue/telegram integration not demonstrated.'},
 {id:136,title:'Mehmon rejimi va vaqtincha tanlovlar',status:'PARTIAL_SOURCE_GAP',code:[['frontend/src/pages/user/barber/bookingDraft.js','DRAFT_TTL_MS'],['frontend/src/pages/user/barber/InlineBooking.jsx','bookingDraft']],tests:[['frontend/test/bookingDraft.test.js','test(']],gap:'Guest 5-minute browser-tab selection and public view exist, but login handoff, slot revalidation and full browser E2E remain.'},
]);
export function auditSevenNotificationPrivacy({projectRoot=ROOT,registryPath=path.join(ROOT,'docs/USTARA_185_NAZORAT.csv')}={}) {
 const previous=auditSevenShopQueue({projectRoot,registryPath});
 if(previous.indexedTotal!==130)throw Error('v174 expected 130 prior unique decisions');
 const summary=summarizeDecisions(registryPath);
 if(previous.registrySha256!==summary.sha256)throw Error('v174 original registry changed');
 const rows=parseCsv(fs.readFileSync(registryPath,'utf8').replace(/^\ufeff/,''));
 const decisions=SPECS.map(spec=>{
  if(rows[spec.id]?.[0]!==String(spec.id)||rows[spec.id]?.[1]!==spec.title)throw Error(`v174 registry mismatch #${spec.id}`);
  return {id:spec.id,decision:spec.title,originalStatus:rows[spec.id][3],sourceStatus:spec.status,
   code:(spec.code||[]).map(([p,needle])=>assertEvidenceFile(projectRoot,p,needle).path),
   tests:(spec.tests||[]).map(([p,needle])=>assertEvidenceFile(projectRoot,p,needle).path),
   missingImplementation:[spec.gap],productionVerified:false};
 });
 return {version:'v174',registrySha256:summary.sha256,totalDecisions:185,reviewedDecisions:7,
  previouslyIndexed:130,indexedNew:7,indexedTotal:137,notYetIndexed:48,
  sourcePartiallyImplemented:decisions.filter(x=>x.sourceStatus==='PARTIAL_SOURCE_GAP').length,
  requirementsNotImplemented:decisions.filter(x=>x.sourceStatus==='NOT_IMPLEMENTED').length,
  decisions,postgresE2E:'NOT_RUN',browserE2E:'NOT_RUN',productionReady:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 try {const result=auditSevenNotificationPrivacy();
  if(process.argv.includes('--require-production'))throw Error('v174 production checks are missing');
  console.log(process.argv.includes('--json')?JSON.stringify(result,null,2):`v174: ${result.indexedTotal}/185 source-reviewed (NOT production complete)`);
 }catch(e){console.error(e.stack);process.exitCode=1;}
}
