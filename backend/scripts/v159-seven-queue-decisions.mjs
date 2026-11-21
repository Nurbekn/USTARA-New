// v159: seven original decision-to-source references, not production certification.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditSmartSeven} from './v158-seven-smart-booking-decisions.mjs';
import {assertEvidenceFile} from './v155-critical-decisions.mjs';
import {parseCsv,summarizeDecisions} from './v153-decision-progress.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const item=(id,title,code,tests,gaps=[])=>({id,title,code,tests,gaps});
export const NEXT_SEVEN=Object.freeze([
 item(24,'Smart Booking markaziy Admin qoidalari',
  [['backend/controllers/adminSmartBookingRules.js','expected_revision'],['backend/services/smartBookingOffers.js','SELECT enabled FROM smart_booking_admin_settings'],['backend/database/migrations/20261218_smart_booking_admin_rules.sql','smart_booking_admin_settings_events']],
  [['backend/test/v159SmartBookingAdminRules.unit.test.js','test(']],
  ['Admin pause/resume SQL va worker unit-testlangan, lekin haqiqiy PostgreSQL parallel lock/race va brauzer E2E hali bajarilmagan.']),
 item(25,'Telegram va saytda taklifning bitta natijasi',
  [['backend/services/smartBookingOffers.js','async function applyDecision'],['backend/services/smartBookingOffers.js','async function decideByTelegram']],
  [['backend/test/smartBookingTelegram.unit.test.js','test('],['backend/test/smartBookingOffers.unit.test.js','test(']],
  ['Site/Telegram callbacklar bir xizmatda ishlaydi, real webhook/polling parallel E2E dalili yo‘q.']),
 item(26,'Walk-in navbatga tez qo‘shish',
  [['backend/controllers/walkinQueueController.js','async function join(req,res)'],['frontend/src/pages/barber/Queue.jsx',"'/api/queue/walk-ins'"]],
  [['backend/test/walkinQueue.unit.test.js','test(']],
  ['Manual guest navbat hali haqiqiy PostgreSQL va mobil E2E bilan tasdiqlanmagan.']),
 item(28,'QR mehmon so‘rovi va sartarosh tasdig‘i',
  [['backend/controllers/walkinQrController.js','async function requestJoin(req,res)'],['backend/controllers/walkinQrController.js','async function decide(req,res)']],
  [['backend/test/walkinQr.unit.test.js','test(']],
  ['QR approval transaction real database race test bilan yakuniy tasdiqlanmagan.']),
 item(29,'Walk-in tasdiq kutayotganlar ro‘yxati',
  [['backend/controllers/walkinQrController.js','async function pendingList(req,res)'],['frontend/src/pages/barber/Queue.jsx','/api/queue/qr-pending']],
  [['backend/test/queueReorderAdminQr.unit.test.js','test(']],
  ['Real DB va barber/mobile browser E2E hali bajarilmagan.']),
 item(30,'Walk-in navbati bo‘shagan vaqt uchun ustuvor',
  [['backend/services/smartBookingOffers.js','ORDER BY q.queue_position ASC NULLS LAST'],['backend/services/smartBookingOffers.js','walkin_manual_claims']],
  [['backend/test/smartBookingOffers.unit.test.js','test('],['backend/test/manualQueueClaims.unit.test.js','test(']],
  ['QR va explicit consent bilan bog‘langan manual mijoz eligible; avtomatik ustuvorlik/haqiqiy DB race to‘liq E2E tasdiqlanmagan.']),
 item(31,'FIFO navbat, qo‘lda yakuniy qaror',
  [['backend/controllers/walkinQueueController.js','ORDER BY queue_position ASC NULLS LAST,id LIMIT 1 FOR UPDATE'],['backend/controllers/walkinQueueController.js','async function reorder(req,res)']],
  [['backend/test/queueReorderAdminQr.unit.test.js','test('],['backend/test/walkinQueue.unit.test.js','test(']],
  ['FIFO va manual override real parallel PostgreSQL transaction va mobil E2E bilan tasdiqlanmagan.'])
]);
export function auditQueueSeven({projectRoot=ROOT,registryPath=path.join(ROOT,'docs/USTARA_185_NAZORAT.csv')}={}){
 const prev=auditSmartSeven({projectRoot,registryPath});
 if(prev.uniqueSourceTraces!==28)throw Error('v159 previous 28 traces not coherent; NOT VERIFIED');
 const registry=summarizeDecisions(registryPath);
 const rows=parseCsv(fs.readFileSync(registryPath,'utf8').replace(/^\ufeff/,''));
 const previous=new Set([5,6,27,75,76,107,165,1,2,3,4,7,8,9,10,11,12,13,14,15,16,
  ...prev.decisions.map(r=>r.id)]);
 if(previous.size!==28)throw Error('v159 duplicate previous IDs; NOT VERIFIED');
 const unique=new Set();
 const decisions=NEXT_SEVEN.map(s=>{
  if(previous.has(s.id)||unique.has(s.id)||rows[s.id]?.[0]!==String(s.id)||rows[s.id]?.[1]!==s.title)
   throw Error('v159 original decision missing, changed or duplicated; NOT VERIFIED');
  unique.add(s.id);
  const code=s.code.map(([file,text])=>assertEvidenceFile(projectRoot,file,text).path);
  const tests=s.tests.map(([file,text])=>assertEvidenceFile(projectRoot,file,text).path);
  return {id:s.id,decision:s.title,originalStatus:rows[s.id][3],code,tests,
   sourceStatus:'PARTIAL_SOURCE_GAP',missingImplementation:[...s.gaps],productionVerified:false};
 });
 if(registry.sha256!==prev.registrySha256)throw Error('v159 immutable registry hash changed; NOT VERIFIED');
 return {version:'v159',totalDecisions:185,registrySha256:registry.sha256,
  previousSourceTraces:28,newSourceTraces:7,uniqueSourceTraces:35,notYetTraced:150,
  decisions,knownGaps:[...prev.knownGaps,...decisions.filter(d=>d.missingImplementation.length).map(d=>({id:d.id,missingImplementation:d.missingImplementation}))],
  originalCounts:registry.counts,smartBookingAdminControl:'UNIT_TESTED_ONLY',
  postgresE2E:'NOT_RUN',browserE2E:'NOT_RUN',telegramE2E:'NOT_RUN',releaseReadiness:'NOT_VERIFIED',productionReady:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const r=auditQueueSeven();
  if(process.argv.includes('--require-production'))throw Error('v159 missing real PostgreSQL, browser and Telegram E2E; NOT VERIFIED');
  console.log(process.argv.includes('--json')?JSON.stringify(r,null,2):
   `v159: ${r.uniqueSourceTraces}/185 source traces; production NOT VERIFIED.`);
 }catch(e){console.error(e.message);process.exitCode=1;}
}
