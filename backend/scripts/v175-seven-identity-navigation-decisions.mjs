// v175: evidence-oriented audit of #137–#143. Indexing is NOT delivery/production verification.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditSevenNotificationPrivacy} from './v174-seven-notification-privacy-decisions.mjs';
import {assertEvidenceFile} from './v155-critical-decisions.mjs';
import {parseCsv,summarizeDecisions} from './v153-decision-progress.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');

export const SPECS=Object.freeze([
 {id:137,title:'Mijoz va sartarosh uchun alohida akkaunt',status:'PARTIAL_SOURCE_GAP',
  code:[['backend/services/registrationService.js','["customer", "barber"]'],['frontend/src/pages/auth/utils/session.js','dashboardPath']],
  tests:[['frontend/test/login.test.js','customer login succeeds'],['frontend/test/login.test.js','barber login succeeds']],
  gap:'Role-separated registration/login and session destinations exist. Real PostgreSQL access checks, cross-role horizontal privilege boundaries and browser E2E remain unverified.'},
 {id:138,title:'Akkauntlar o‘rtasida oddiy chiqish kirish',status:'PARTIAL_SOURCE_GAP',
  code:[['frontend/src/pages/auth/utils/session.js','clearSession({ notify'],['frontend/src/pages/auth/utils/session.js','subscribeSession(listener)']],
  tests:[['frontend/test/v68CrossTabSession.test.js','test('],['frontend/test/login.test.js','test(']],
  gap:'Logout clears browser session credentials and notifies other tabs; manually logging into another account uses existing login. Full browser/device revocation E2E is pending.'},
 {id:139,title:'Bir telefon raqami faqat bitta akkaunt',status:'PARTIAL_SOURCE_GAP',
  code:[['backend/database/schema.sql','phone VARCHAR(20) NOT NULL UNIQUE'],['backend/services/registrationService.js','normalizePhone']],
  tests:[['backend/test/authPolicy.unit.test.js','canonical schema and migrations enforce database-level unique users.phone']],
  gap:'DB UNIQUE and phone canonicalization exist; real parallel sign-up and PostgreSQL uniqueness tests remain unrun.'},
 {id:140,title:'Professional Account Recovery',status:'PARTIAL_SOURCE_GAP',
  code:[['backend/services/manualAccountRecovery.js','manual_recovery_cases'],['backend/routes/auth.js',"'/account-recovery/start'"]],
  tests:[['backend/test/manualAccountRecovery.unit.test.js','test(']],
  gap:'Support case and Admin-review requests exist, but completed identity verification, credential/phone recovery workflow and live PostgreSQL/notification E2E are NOT implemented/verified. Admin status is not a credential reset.'},
 {id:141,title:'Smart Navigation 2GIS Yandex Google',status:'PARTIAL_SOURCE_GAP',
  code:[['frontend/src/pages/user/barber/publicNavigationV175.js','publicBarberMapLinksV175'],['frontend/src/pages/user/barber/BarberPublicProfile.jsx','bpv-navigation-v175'],['frontend/src/pages/user/bookings/navigation.js','2GIS']],
  tests:[['frontend/test/v175PublicBarberNavigation.test.js',"test('#141"],['frontend/test/v125BookingContactNavigation.test.js','map providers use trusted HTTPS hosts']],
  gap:'Ommaviy profil/bookingda xarita pin-havolalari mavjud, koordinatasiz havola yo‘q. Haqiqiy marshrut hisobi, provayder URLlarining onlayn tekshiruvi, telefon qurilmalari va browser E2E bajarilmagan.'},
 {id:142,title:'Smart Working Hours',status:'PARTIAL_SOURCE_GAP',
  code:[['frontend/src/pages/barber/components/WorkingHours.jsx','applyToWorkdays'],['backend/services/barberSetup.js','start_time']],
  tests:[['frontend/test/v145AccountBarberLanguages.test.js','working hours translates labels'],['backend/test/bookings.unit.test.js','setWorkingHours']],
  gap:'Haftalik ish vaqtini belgilash va nusxalash UI mavjud; real PG timezone, istisno kunlar va parallel bron konfliktlari to‘liq E2E qilinmagan.'},
 {id:143,title:'Smart Price Transparency',status:'PARTIAL_SOURCE_GAP',
  code:[['backend/services/bookingSelection.js','expectedPriceMatches'],['frontend/src/pages/user/barber/InlineBooking.jsx','price']],
  tests:[['backend/test/bookingPriceSnapshot.unit.test.js','test('],['backend/test/bookingSelection.unit.test.js','test(']],
  gap:'Xizmat narxlari va bronning server quote/snapshot qoidalari kodda bor; full transaction/PostgreSQL E2E va narx o‘zgarganda barcha UI holatlari tasdiqlanmagan. Platformada onlayn to‘lov tasdiqlanmaydi.'},
]);
export function auditSevenIdentityNavigation({projectRoot=ROOT,registryPath=path.join(ROOT,'docs/USTARA_185_NAZORAT.csv')}={}) {
 const previous=auditSevenNotificationPrivacy({projectRoot,registryPath});
 if(previous.indexedTotal!==137)throw Error('v175 expected 137 previously indexed decisions');
 const summary=summarizeDecisions(registryPath);
 if(previous.registrySha256!==summary.sha256)throw Error('v175 original registry changed');
 const rows=parseCsv(fs.readFileSync(registryPath,'utf8').replace(/^\ufeff/,''));
 const decisions=SPECS.map(spec=>{
  if(rows[spec.id]?.[0]!==String(spec.id)||rows[spec.id]?.[1]!==spec.title)throw Error(`v175 registry mismatch #${spec.id}`);
  return {id:spec.id,decision:spec.title,originalStatus:rows[spec.id][3],sourceStatus:spec.status,
   code:(spec.code||[]).map(([p,needle])=>assertEvidenceFile(projectRoot,p,needle).path),
   tests:(spec.tests||[]).map(([p,needle])=>assertEvidenceFile(projectRoot,p,needle).path),
   missingImplementation:[spec.gap],productionVerified:false};
 });
 return {version:'v175',registrySha256:summary.sha256,totalDecisions:185,reviewedDecisions:7,
  previouslyIndexed:137,indexedNew:7,indexedTotal:144,notYetIndexed:41,
  sourcePartiallyImplemented:decisions.filter(x=>x.sourceStatus==='PARTIAL_SOURCE_GAP').length,
  requirementsNotImplemented:decisions.filter(x=>x.sourceStatus==='NOT_IMPLEMENTED').length,
  decisions,postgresE2E:'NOT_RUN',browserE2E:'NOT_RUN',productionReady:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 try {const result=auditSevenIdentityNavigation();
  if(process.argv.includes('--require-production'))throw Error('v175 production checks are missing');
  console.log(process.argv.includes('--json')?JSON.stringify(result,null,2):`v175: ${result.indexedTotal}/185 source-reviewed (NOT production complete)`);
 }catch(e){console.error(e.stack);process.exitCode=1;}
}
