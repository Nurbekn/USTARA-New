// v180 is a source-trace audit only, not certification of the real deployment.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditSevenIdentitySocialDecisions} from './v179-seven-identity-social-decisions.mjs';
import {assertEvidenceFile} from './v155-critical-decisions.mjs';
import {parseCsv,summarizeDecisions} from './v153-decision-progress.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const SPECS=Object.freeze([
 {id:172,title:'Profil yashirish funksiyasi BEKOR',status:'CANCELLED_BY_USER',
  gap:'Profile hiding was explicitly cancelled. No new hide-profile toggle is introduced.'},
 {id:173,title:'Mijozga faqat bo‘sh vaqt va navbat',status:'PARTIAL_SOURCE_GAP',
  code:[['backend/controllers/bookingsController.js','busy: busy.map'],['frontend/src/pages/user/barber/availableSlots.js','_privateBusy']],
  tests:[['backend/test/bookings.unit.test.js','test(']],
  gap:'Busy slots are limited to the owning barber; customer reads expose availability. Queue ETA and live DB/browser privacy remain unverified.'},
 {id:174,title:'Bron tafsilotida xarita va qo‘ng‘iroq',status:'PARTIAL_SOURCE_GAP',
  code:[['frontend/src/pages/user/barber/publicNavigationV175.js','publicBarberMapLinksV175'],['frontend/src/pages/user/barber/publicPhoneV178.js','publicBarberPhoneHrefV178']],
  tests:[['frontend/test/v175PublicBarberNavigation.test.js','test(']],
  gap:'Public profile navigation and telephone links exist and booking contacts have earlier source evidence. Live booking-detail browser/network test is not complete.'},
 {id:175,title:'Sartaroshxona yopilganda butunlay o‘chirish',status:'NOT_IMPLEMENTED',
  gap:'A single-address shop model now exists, but an approved shop-closing and erasure/retention policy with team and booking dependencies is not implemented. No destructive deletion introduced.'},
 {id:176,title:'Telefon orqali bron uchun alohida xabar shart emas',status:'NOT_IMPLEMENTED',
  gap:'The requirement not to send an automatic notification is accepted, but there is no verified barber-initiated manual phone-booking workflow to which it can safely apply.'},
 {id:177,title:'Admin suspend qilsa bronlar xavfsiz boshqariladi',status:'NOT_IMPLEMENTED',
  gap:'No verified admin suspension lifecycle for preserving/resolving existing bookings. Account deactivation is a separate user action, not equivalent to admin suspension.'},
 {id:178,title:'Profildagi xatoni bir tugma bilan bildirish',status:'PARTIAL_SOURCE_GAP',
  code:[['backend/controllers/profileIssueReports.js','createProfileIssueHandlers'],['frontend/src/pages/user/barber/ProfileIssueReport.jsx','canSendProfileIssue'],['frontend/src/pages/user/barber/profileIssueLocaleV180.js','profileIssueUiV180'],['frontend/src/pages/user/barber/profileIssueModel.js','canSendProfileIssue']],
  tests:[['frontend/test/v180ProfileIssueSafeRetry.test.js',"test('v180"],['backend/test/v128ProfileIssueReports.unit.test.js',"test("]],
  gap:'Customer report, admin review, three-language form and fail-closed status recheck are present. Real PostgreSQL/HTTP/browser and rate-abuse load tests are not run.'},
]);
export function auditSevenFinalSafetyDecisions({projectRoot=ROOT,registryPath=path.join(ROOT,'docs/USTARA_185_NAZORAT.csv')}={}){
 const prior=auditSevenIdentitySocialDecisions({projectRoot,registryPath});
 if(prior.indexedTotal!==172)throw Error('v180 requires 172 indexed decisions from v179');
 const summary=summarizeDecisions(registryPath);
 if(prior.registrySha256!==summary.sha256)throw Error('Canonical decision registry has changed');
 const rows=parseCsv(fs.readFileSync(registryPath,'utf8').replace(/^\ufeff/,''));
 const decisions=SPECS.map(spec=>{
  if(rows[spec.id]?.[0]!==String(spec.id)||rows[spec.id]?.[1]!==spec.title)
   throw Error(`Canonical decision #${spec.id} changed`);
  return {id:spec.id,decision:spec.title,originalStatus:rows[spec.id][3],sourceStatus:spec.status,
   code:(spec.code||[]).map(([rel,needle])=>assertEvidenceFile(projectRoot,rel,needle).path),
   tests:(spec.tests||[]).map(([rel,needle])=>assertEvidenceFile(projectRoot,rel,needle).path),
   missingImplementation:[spec.gap],productionVerified:false};
 });
 return {version:'v180',registrySha256:summary.sha256,totalDecisions:185,reviewedDecisions:7,
  previouslyIndexed:172,indexedNew:7,indexedTotal:179,notYetIndexed:6,
  sourcePartiallyImplemented:decisions.filter(x=>x.sourceStatus==='PARTIAL_SOURCE_GAP').length,
  requirementsNotImplemented:decisions.filter(x=>x.sourceStatus==='NOT_IMPLEMENTED').length,
  explicitlyCancelled:decisions.filter(x=>x.sourceStatus==='CANCELLED_BY_USER').length,
  decisions,postgresE2E:'NOT_RUN',browserE2E:'NOT_RUN',telegramE2E:'NOT_RUN',productionReady:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=auditSevenFinalSafetyDecisions();
  if(process.argv.includes('--require-production'))throw Error('Production E2E not completed');
  console.log(process.argv.includes('--json')?JSON.stringify(result,null,2):`v180: ${result.indexedTotal}/185 source-reviewed, production NOT_VERIFIED`);
 }catch(error){console.error(error.stack);process.exitCode=1;}
}
