// v176: source evidence for #144–#150; indexing does NOT signify completion.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditSevenIdentityNavigation} from './v175-seven-identity-navigation-decisions.mjs';
import {assertEvidenceFile} from './v155-critical-decisions.mjs';
import {parseCsv,summarizeDecisions} from './v153-decision-progress.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const SPECS=Object.freeze([
 {id:144,title:'Internet uzilganda Booking Recovery',status:'PARTIAL_SOURCE_GAP',
  code:[['backend/services/bookingRecovery.js','recoverBooking'],['backend/services/bookingIdempotency.js','fingerprint']],
  tests:[['backend/test/v81BookingRecovery.unit.test.js','recoverBooking'],['backend/test/bookingIdempotency.unit.test.js','bookingRequest']],
  gap:'Idempotency and read-only recovery exist; real PG concurrent transactions, network interruption and browser E2E remain unverified.'},
 {id:145,title:'Professional Booking Inbox',status:'PARTIAL_SOURCE_GAP',
  code:[['frontend/src/pages/barber/Bookings.jsx','BookingInboxFiltersV176'],['frontend/src/pages/barber/data/bookingInboxV176.js','filterBookingInboxV176']],
  tests:[['frontend/test/v176ProfessionalBookingInbox.test.js',"test('#145"]],
  gap:'Read-only client-side search, date and existing status tabs over already-loaded bookings. Server-wide history pagination, full inbox search and real browser E2E are not implemented/verified.'},
 {id:146,title:'Adaptive Booking Timeline',status:'PARTIAL_SOURCE_GAP',
  code:[['frontend/src/pages/barber/components/BookingDayTimelineV160.jsx','buildBookingTimeline']],
  tests:[['frontend/test/v160BookingDayTimeline.test.js','test(']],
  gap:'Read-only timeline with five statuses exists; end-to-end calendar updates, DST/timezone and real PG event races are unverified.'},
 {id:147,title:'Compact Client History',status:'NOT_IMPLEMENTED',
  gap:'No server-scoped authorization and privacy-minimized per-client history UI is implemented; a booking list is not a cross-visit client card.'},
 {id:148,title:'Verified Sartaroshxona',status:'NOT_IMPLEMENTED',
  gap:'Shop profile and barber badge do not amount to independently verified shop registration, Admin evidence review or shop verification lifecycle.'},
 {id:149,title:'Safe Ownership Transfer',status:'NOT_IMPLEMENTED',
  gap:'No two-party shop-ownership consent, Admin review, role handoff and transactional transfer exists; do not imply shop owner can transfer rights.'},
 {id:150,title:'Safe Block foydalanuvchilar orasida',status:'NOT_IMPLEMENTED',
  gap:'No authenticated mutual user block/unblock policy across profile, social/chat and bookings has been implemented or tested.'},
]);
export function auditSevenBookingPrivacy({projectRoot=ROOT,registryPath=path.join(ROOT,'docs/USTARA_185_NAZORAT.csv')}={}) {
 const previous=auditSevenIdentityNavigation({projectRoot,registryPath});
 if(previous.indexedTotal!==144)throw Error('v176 expected 144 previously source-reviewed decisions');
 const summary=summarizeDecisions(registryPath);
 if(previous.registrySha256!==summary.sha256)throw Error('v176 original registry hash changed');
 const rows=parseCsv(fs.readFileSync(registryPath,'utf8').replace(/^\ufeff/,''));
 const decisions=SPECS.map(spec=>{
  if(rows[spec.id]?.[0]!==String(spec.id)||rows[spec.id]?.[1]!==spec.title)throw Error(`v176 registry mismatch #${spec.id}`);
  return {id:spec.id,decision:spec.title,originalStatus:rows[spec.id][3],sourceStatus:spec.status,
   code:(spec.code||[]).map(([p,needle])=>assertEvidenceFile(projectRoot,p,needle).path),
   tests:(spec.tests||[]).map(([p,needle])=>assertEvidenceFile(projectRoot,p,needle).path),
   missingImplementation:[spec.gap],productionVerified:false};
 });
 return {version:'v176',registrySha256:summary.sha256,totalDecisions:185,reviewedDecisions:7,
  previouslyIndexed:144,indexedNew:7,indexedTotal:151,notYetIndexed:34,
  sourcePartiallyImplemented:decisions.filter(x=>x.sourceStatus==='PARTIAL_SOURCE_GAP').length,
  requirementsNotImplemented:decisions.filter(x=>x.sourceStatus==='NOT_IMPLEMENTED').length,
  decisions,postgresE2E:'NOT_RUN',browserE2E:'NOT_RUN',productionReady:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try {const a=auditSevenBookingPrivacy();
  if(process.argv.includes('--require-production'))throw Error('v176 has not passed production integration checks');
  console.log(process.argv.includes('--json')?JSON.stringify(a,null,2):`v176: ${a.indexedTotal}/185 source-reviewed; NOT production verified`);
 }catch(e){console.error(e.stack);process.exitCode=1;}
}
