// v167: source references for exact original #81–#87 decisions. Not a release certificate.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditSevenGuidance} from './v166-seven-guidance-decisions.mjs';
import {assertEvidenceFile,auditCriticalDecisions} from './v155-critical-decisions.mjs';
import {summarizeDecisions,parseCsv} from './v153-decision-progress.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const item=(id,title,code,tests,gap)=>({id,title,code,tests,gap});
export const SEVEN=Object.freeze([
 item(81,'Professional Ilhom post muharriri',
   [['frontend/src/pages/user/social/Composer.jsx','setStep("preview")'],['backend/controllers/socialController.js','async function createPost']],
   [['frontend/test/socialModel.test.js','test(']],
   'Composer preview and caption, post service attachment exist. Full professional templates, filters, crop/trim and upload E2E NOT VERIFIED.'),
 item(82,'Izoh javob pin va spam moderatsiyasi',
   [['backend/controllers/commentPinV167.js','async function setPin'],['backend/controllers/socialController.js','recent_total'],['frontend/src/pages/barber/components/PostReactions.jsx','setSocialCommentPin']],
   [['backend/test/v167SocialCommentPin.unit.test.js',"test('#82"],['frontend/test/v167CommentPin.test.js',"test('#82"]],
   'One barber-owned pinned comment per post and rate/duplicate checks added; threaded replies, moderation appeals, abuse across concurrent posts, PostgreSQL race and browser E2E NOT VERIFIED.'),
 item(83,'Admin kontent moderatsiyasi',
   [['backend/controllers/adminOperations.js','async function removePost'],['backend/controllers/socialController.js','async function report']],
   [['backend/test/v165AdminOperations.unit.test.js','test(']],
   'Post report and Admin deletion exist; standalone comment reports, appeal queues, and fully audited moderation decision lifecycle NOT IMPLEMENTED.'),
 item(84,'Security Center va sessiyalar',
   [['backend/controllers/sessionsController.js','async revokeOne'],['frontend/src/components/DeviceSessionsPanel.jsx','DeviceSessionsPanel']],
   [['backend/test/deviceSessions.unit.test.js','test(']],
   'Device sessions/revoke exist; end-to-end phone/session change plus real PostgreSQL enforcement NOT VERIFIED.'),
 item(85,'Sartarosh offline amallari xavfsiz sinxron',
   [['frontend/src/components/ConnectionNoticeV163.jsx','onOffline'],['frontend/src/components/networkNoticeV163.js','networkNoticeStatus']],
   [['frontend/test/v163OfflineAndAlternatives.test.js','test(']],
   'Offline/reconnect warning exists only. Offline mutation queue, idempotent sync, conflicts, and server reconciliation are NOT IMPLEMENTED.'),
 item(86,'Smart Client Card shaxsiylik bilan',
   [['backend/controllers/customersController.js','Bu mijozni ko\'rishga ruxsatingiz yo\'q'],['backend/controllers/bookingsController.js','customer_phone']],
   [['backend/test/v88CustomerPhonePrivacy.unit.test.js','test(']],
   'Customer contact access restricted by booking ownership; dedicated consent-aware Smart Client Card, private notes and retention policy NOT IMPLEMENTED.'),
 item(87,'Qayta bron qilish va sevimli to‘plamlar',
   [['frontend/src/pages/user/Bookings.jsx','alternativeBookingUrl(b)'],['frontend/src/pages/user/barber/InlineBooking.jsx','canRebook']],
   [['frontend/test/v101CancellationAlternatives.test.js','test(']],
   'Rebooking selections exist and are server-revalidated, but named favorites and reusable service collections are NOT IMPLEMENTED.'),
]);
export function auditSevenSocial({projectRoot=ROOT,registryPath=path.join(ROOT,'docs/USTARA_185_NAZORAT.csv')}={}) {
 const previous=auditSevenGuidance({projectRoot,registryPath});
 if(previous.uniqueSourceTraces!==82)throw Error('v167 expected 82 prior source traces; NOT VERIFIED');
 const original=summarizeDecisions(registryPath);
 if(previous.registrySha256!==original.sha256)throw Error('v167 original registry mismatch; NOT VERIFIED');
 const critical=auditCriticalDecisions({projectRoot,registryPath});
 const already=new Set([...critical.decisions.map(x=>x.id), ...previous.decisions.map(x=>x.id)]);
 const rows=parseCsv(fs.readFileSync(registryPath,'utf8').replace(/^\ufeff/,''));
 const seen=new Set();
 const decisions=SEVEN.map(spec=>{
   if(seen.has(spec.id)||rows[spec.id]?.[0]!==String(spec.id)||rows[spec.id]?.[1]!==spec.title)
     throw Error(`v167 decision #${spec.id} differs from original register; NOT VERIFIED`);
   seen.add(spec.id);
   const code=spec.code.map(([file,token])=>assertEvidenceFile(projectRoot,file,token).path);
   const tests=spec.tests.map(([file,token])=>assertEvidenceFile(projectRoot,file,token).path);
   return {id:spec.id,decision:spec.title,originalStatus:rows[spec.id][3],code,tests,
     sourceStatus:already.has(spec.id)?'ALREADY_INDEXED_PARTIAL':'PARTIAL_SOURCE_GAP',
     missingImplementation:[spec.gap],productionVerified:false};
 });
 const duplicated=decisions.filter(d=>already.has(d.id)).map(d=>d.id);
 const newSourceTraces=decisions.length-duplicated.length;
 const uniqueSourceTraces=previous.uniqueSourceTraces+newSourceTraces;
 return {version:'v167',totalDecisions:185,registrySha256:original.sha256,
   previousSourceTraces:previous.uniqueSourceTraces,reviewedDecisions:7,alreadyIndexed:duplicated,
   newSourceTraces,uniqueSourceTraces,notYetTraced:185-uniqueSourceTraces,
   decisions,originalCounts:original.counts,
   knownGaps:[...previous.knownGaps,...decisions.filter(d=>!duplicated.includes(d.id)).map(d=>({id:d.id,missingImplementation:d.missingImplementation}))],
   postgresE2E:'NOT_RUN',browserE2E:'NOT_RUN',offlineBarberSync:'NOT_IMPLEMENTED',smartClientCard:'NOT_IMPLEMENTED',
   releaseReadiness:'NOT_VERIFIED',productionReady:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const data=auditSevenSocial();
  if(process.argv.includes('--require-production'))throw Error('v167 production readiness NOT VERIFIED');
  console.log(process.argv.includes('--json')?JSON.stringify(data,null,2):`v167 reviewed 7; +${data.newSourceTraces} unique ${data.uniqueSourceTraces}/185; production NOT VERIFIED`);
 }catch(error){console.error(error.message);process.exitCode=1;}
}
