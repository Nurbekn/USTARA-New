// v161 / #39–#45: code+test source trace only; NOT real PostgreSQL/browser E2E.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditTimelineSeven} from './v160-seven-timeline-decisions.mjs';
import {parseCsv,summarizeDecisions} from './v153-decision-progress.mjs';
import {assertEvidenceFile} from './v155-critical-decisions.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const spec=(id,title,code,tests,gap)=>({id,title,code,tests,gap});
export const NEXT_SEVEN=Object.freeze([
 spec(39,'Real-time chat va post ulashish',
  [['backend/services/customerBarberChat.js','async function send(req,res)'],['backend/database/migrations/20261219_customer_barber_chat.sql','CREATE TABLE customer_barber_chat_messages'],['frontend/src/pages/chat/ChatV161.jsx','setInterval(()=>{void refresh();},6000)'],['frontend/src/pages/user/social/PostCard.jsx','Chatda ulashish']],
  [['backend/test/v161PrivateChat.unit.test.js',"test('message reads"],['frontend/test/v161ChatModel.test.js',"test('chat links"]],
  'Private chat REST/polling foundation; 6-second polling is NOT true push real-time. Browser, real PostgreSQL, abuse controls and lost-ACK idempotency not verified.'),
 spec(40,'Chat tezkor javoblar va keyingi AI',
  [['frontend/src/pages/chat/chatModelV161.js','QUICK_REPLIES_V161'],['frontend/src/pages/chat/ChatV161.jsx','chatQuickRepliesV161']],
  [['frontend/test/v161ChatModel.test.js',"test('only barber"]],
  'Three languages and 3 preset human quick replies. AI generation/inference is not implemented.'),
 spec(41,'AI va odam chatini farqlash',
  [['backend/services/customerBarberChat.js',"VALUES($1,$2,$3,$4,'human')"],['backend/database/migrations/20261219_customer_barber_chat.sql','sender_kind VARCHAR'],['frontend/src/pages/chat/ChatV161.jsx','ui.sourceAi']],
  [['backend/test/v161PrivateChat.unit.test.js',"test('sender role cannot set AI provenance"],['frontend/test/v161ChatModel.test.js',"test('untrusted message"]],
  'Human sender provenance enforced in API; AI sender route and end-to-end provenance verification not implemented.'),
 spec(42,'Profil bron qilish tugmasining ustuvorligi',
  [['frontend/src/pages/user/barber/BarberPublicProfile.jsx','bpv-booking-jump'],['frontend/src/pages/user/barber/BarberPublicProfile.css','.bpv-booking-jump']],
  [['frontend/test/profileNavigationV116.test.js','test(']],
  'Booking CTA exists; mobile browser prominence/accessibility not reverified.'),
 spec(43,'Belgilangan reklamalar, onlayn to‘lovsiz',
  [['frontend/src/pages/user/UserHome.jsx','uh-sponsored-label'],['backend/controllers/adminPromotions.js','is_active']],
  [['frontend/test/v131FollowedHomeSafety.test.js','test(']],
  'Public ads labelled, no online payments; live campaign visibility and accessibility E2E unverified.'),
 spec(44,'Admin reklama kampaniya boshqaruvi',
  [['backend/controllers/adminPromotions.js','async function enable'],['backend/routes/admin.js',"router.put('/promotions/:id',authMiddleware,ops.adminOnly,promos.enable)"],['frontend/src/pages/AdminPanel.jsx',"tab==='promotions'"]],
  [['backend/test/promotions.unit.test.js','test(']],
  'Admin-only enable/disable with duration exists; real DB, concurrency and billing proof not verified.'),
 spec(45,'Sartarosh tasdiqlanishi Admin orqali',
  [['backend/controllers/barbersController.js','async function verifyBarber'],['backend/routes/barbers.js','router.patch("/:id/verify", authMiddleware, verifyBarber)'],['frontend/src/pages/AdminPanel.jsx',"verify(r.id,'approved')"]],
  [['backend/test/barber-profile.unit.test.js','test(']],
  'Admin role guard exists; real verification lifecycle and audit evidence E2E missing.'),
]);
export function auditChatSeven({projectRoot=ROOT,registryPath=path.join(ROOT,'docs/USTARA_185_NAZORAT.csv')}={}) {
 const previous=auditTimelineSeven({projectRoot,registryPath});
 if(previous.uniqueSourceTraces!==42)throw Error('v161 previous trace count unexpected; NOT VERIFIED');
 const summary=summarizeDecisions(registryPath);
 if(previous.registrySha256!==summary.sha256)throw Error('v161 registry checksum changed; NOT VERIFIED');
 const rows=parseCsv(fs.readFileSync(registryPath,'utf8').replace(/^\ufeff/,''));
 const ids=new Set();
 const decisions=NEXT_SEVEN.map(s=>{
  if(ids.has(s.id)||previous.decisions.some(d=>d.id===s.id)||rows[s.id]?.[0]!==String(s.id)||rows[s.id]?.[1]!==s.title)
   throw Error('v161 decision mismatch or duplicate; NOT VERIFIED');
  ids.add(s.id);
  const code=s.code.map(([file,needle])=>assertEvidenceFile(projectRoot,file,needle).path);
  const tests=s.tests.map(([file,needle])=>assertEvidenceFile(projectRoot,file,needle).path);
  return {id:s.id,decision:s.title,originalStatus:rows[s.id][3],code,tests,sourceStatus:'PARTIAL_SOURCE_GAP',
   missingImplementation:[s.gap],productionVerified:false};
 });
 if(ids.size!==7||previous.uniqueSourceTraces+ids.size!==49)throw Error('v161 unique count mismatch; NOT VERIFIED');
 return {version:'v161',totalDecisions:185,registrySha256:summary.sha256,
  previousSourceTraces:42,newSourceTraces:7,uniqueSourceTraces:49,notYetTraced:136,
  decisions,knownGaps:[...previous.knownGaps,...decisions.map(d=>({id:d.id,missingImplementation:d.missingImplementation}))],
  originalCounts:summary.counts,postgresE2E:'NOT_RUN',browserE2E:'NOT_RUN',telegramE2E:'NOT_RUN',
  releaseReadiness:'NOT_VERIFIED',productionReady:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 try {const result=auditChatSeven();
  if(process.argv.includes('--require-production'))throw Error('v161 PostgreSQL/browser/release evidence NOT VERIFIED');
  console.log(process.argv.includes('--json')?JSON.stringify(result,null,2):`v161: ${result.uniqueSourceTraces}/185 source references only; production NOT VERIFIED.`);
 }catch(e){console.error(e.message);process.exitCode=1;}
}
