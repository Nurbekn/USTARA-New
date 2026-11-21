// Source evidence only, NOT DB/browser/Telegram integration certification.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditSevenComplaintDayDecisions} from './v177-seven-complaint-day-decisions.mjs';
import {assertEvidenceFile} from './v155-critical-decisions.mjs';
import {parseCsv,summarizeDecisions} from './v153-decision-progress.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const SPECS=Object.freeze([
 {id:158,title:'Smart Image Optimization',status:'PARTIAL_SOURCE_GAP',
  code:[['frontend/src/pages/user/barber/BarberPublicProfile.jsx','decoding="async"'],['frontend/src/pages/user/explore/ResultCard.jsx','loading="lazy"']],
  tests:[],gap:'Lazy image loading and asynchronous decoding exist; there is no verified automatic resizing, responsive image derivatives, CDN strategy, or measured real-device performance.'},
 {id:159,title:'Sartarosh telefoni ochiq, mijozniki o‘z bronida',status:'PARTIAL_SOURCE_GAP',
  code:[['backend/services/barberProfile.js','u.phone AS phone'],['backend/controllers/barbersController.js','"specialty", "phone"'],['frontend/src/pages/user/barber/publicPhoneV178.js','publicBarberPhoneHrefV178'],['frontend/src/pages/user/barber/BarberPublicProfile.jsx','barberPhoneHref']],
  tests:[['backend/test/v178PublicBarberPhone.unit.test.js',"test('#159"],['frontend/test/v178PublicPhoneDistricts.test.js',"test('#159"]],
  gap:'Verified active barber canonical phone is returned on public profile and link is validated. Customer phone is not published there. Private booking-contact authorization and real guest/browser/PostgreSQL integrations remain unverified.'},
 {id:160,title:'Telefon orqali Quick Manual Booking',status:'NOT_IMPLEMENTED',
  gap:'The barber cannot yet create a normal booking using only an agreed telephone conversation. Do not confuse manual queue claims with manual bookings; do not bypass OTP by creating an account.'},
 {id:161,title:'Takrorlanuvchi tanaffuslar',status:'PARTIAL_SOURCE_GAP',
  code:[['backend/controllers/breakRulesController.js','weekly'],['backend/services/calendarSchedule.js','ustara_effective_breaks']],
  tests:[['backend/test/breakRules.unit.test.js','test(']],
  gap:'Recurring break CRUD and schedule checks have unit evidence; PostgreSQL overlap/race and browser E2E remain unverified.'},
 {id:162,title:'Smart Service Change mijoz boshlaydi',status:'PARTIAL_SOURCE_GAP',
  code:[['backend/services/bookingModification.js','modifyCustomerBooking'],['backend/controllers/bookingsController.js','modifyBooking']],
  tests:[['backend/test/bookingModification.unit.test.js','test(']],
  gap:'Authenticated customer change with concurrency and quote checks exists in source, but full PostgreSQL/browser E2E is not verified.'},
 {id:163,title:'Sartarosh xizmat paytidagi alohida edit BEKOR',status:'CANCELLED_BY_USER',
  gap:'The user explicitly cancelled the barber-initiated separate in-service edit workflow. Do not implement or count it as missing.'},
 {id:164,title:'Manzil va tuman bo‘yicha qidiruv',status:'PARTIAL_SOURCE_GAP',
  code:[['frontend/src/pages/user/explore/catalog.js','publishedDistrictSuggestions'],['frontend/src/pages/user/Explore.jsx','ex-public-districts-v178']],
  tests:[['frontend/test/v178PublicPhoneDistricts.test.js',"test('#164"],['frontend/test/v117ExploreSearchContract.test.js',"test('#16/#164"]],
  gap:'Public address/district text search now offers bounded de-duplicated data-backed district suggestions. The API does not provide structured district/region and no reverse geocoding or live browser E2E has been verified.'},
]);
export function auditSevenPhoneDistrictDecisions({projectRoot=ROOT,registryPath=path.join(ROOT,'docs/USTARA_185_NAZORAT.csv')}={}){
 const previous=auditSevenComplaintDayDecisions({projectRoot,registryPath});
 if(previous.indexedTotal!==158)throw Error('v178 must follow 158 reviewed decisions');
 const summary=summarizeDecisions(registryPath);
 if(previous.registrySha256!==summary.sha256)throw Error('registry changed');
 const rows=parseCsv(fs.readFileSync(registryPath,'utf8').replace(/^\ufeff/,''));
 const decisions=SPECS.map(spec=>{
  if(rows[spec.id]?.[0]!==String(spec.id)||rows[spec.id]?.[1]!==spec.title)
   throw Error(`source registry mismatch: ${spec.id}`);
  return {id:spec.id,decision:spec.title,originalStatus:rows[spec.id][3],sourceStatus:spec.status,
   code:(spec.code||[]).map(([p,needle])=>assertEvidenceFile(projectRoot,p,needle).path),
   tests:(spec.tests||[]).map(([p,needle])=>assertEvidenceFile(projectRoot,p,needle).path),
   missingImplementation:[spec.gap],productionVerified:false};
 });
 return {version:'v178',registrySha256:summary.sha256,totalDecisions:185,reviewedDecisions:7,
  previouslyIndexed:158,indexedNew:7,indexedTotal:165,notYetIndexed:20,
  sourcePartiallyImplemented:decisions.filter(x=>x.sourceStatus==='PARTIAL_SOURCE_GAP').length,
  requirementsNotImplemented:decisions.filter(x=>x.sourceStatus==='NOT_IMPLEMENTED').length,
  explicitlyCancelled:decisions.filter(x=>x.sourceStatus==='CANCELLED_BY_USER').length,
  decisions,postgresE2E:'NOT_RUN',browserE2E:'NOT_RUN',productionReady:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try {const result=auditSevenPhoneDistrictDecisions();
  if(process.argv.includes('--require-production'))throw Error('Integration checks not completed');
  console.log(process.argv.includes('--json')?JSON.stringify(result,null,2):`v178: ${result.indexedTotal}/185 source-reviewed, NOT production verified`);
 }catch(e){console.error(e.stack);process.exitCode=1;}
}
