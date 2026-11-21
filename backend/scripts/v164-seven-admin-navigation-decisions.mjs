// v164 / original #60–#66. Static source trace ONLY, no claim of integration or production readiness.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditAvailabilitySeven} from './v163-seven-availability-and-experience-decisions.mjs';
import {parseCsv,summarizeDecisions} from './v153-decision-progress.mjs';
import {assertEvidenceFile} from './v155-critical-decisions.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const spec=(id,title,code,tests,gap)=>({id,title,code,tests,gap});
export const NEXT_SEVEN=Object.freeze([
 spec(60,'Mijoz beshta navigatsiya bo‘limi',
  [['frontend/src/layouts/UserLayout.jsx','const navigation = ['],['frontend/src/layouts/UserLayout.jsx','/user/explore?type=barbers']],
  [['frontend/test/v141SiteShellLanguages.test.js','v141 customer navigation keeps decision #60']],
  'Five tabs and routes source tested; actual mobile navigation, screen readers and browser E2E NOT RUN.'),
 spec(61,'Sartarosh beshta navigatsiya bo‘limi',
  [['frontend/src/layouts/BarberLayout.jsx','const NAV = ['],['frontend/src/layouts/BarberLayout.jsx','/barber/queue']],
  [['frontend/test/v141SiteShellLanguages.test.js','v141 barber navigation keeps existing five route IDs']],
  'Five barber routes source tested; responsive behavior and real authenticated browser E2E NOT RUN.'),
 spec(62,'Admin desktop sidebar',
  [['frontend/src/pages/AdminPanel.jsx','className="admin-side"'],['frontend/src/pages/AdminPanel.css','.admin-side nav']],
  [['frontend/test/v139AdminLanguages.test.js','admin navigation and overview']],
  'Admin sidebar code exists; desktop/mobile visual/a11y testing not completed.'),
 spec(63,'Admin dashboard ko‘rsatkichlari',
  [['backend/controllers/adminOperations.js','async function overview('],['frontend/src/pages/AdminPanel.jsx','className="admin-stats"']],
  [['frontend/test/v139AdminLanguages.test.js','admin navigation and overview']],
  'Basic aggregate counts are shown; live dashboard freshness, metrics accuracy, and actual PG aggregation have not been E2E verified.'),
 spec(64,'Admin akkauntlar va xavfsizlik',
  [['backend/controllers/adminOperations.js','async function deleteUser('],['backend/routes/admin.js',"router.get('/users', authMiddleware, ops.adminOnly"]],
  [['backend/test/loginProtection.unit.test.js','createAdminLogin'],['frontend/test/v140AdminOperationsLanguages.test.js','v140 operational confirmations']],
  'Admin auth/list/deletion sources are present; full account audit/privilege testing and production security review NOT VERIFIED.'),
 spec(65,'Admin sartarosh monitoringi',
  [['backend/controllers/adminOperations.js','async function barbers('],['backend/controllers/barbersController.js','async function verifyBarber(']],
  [['frontend/test/v140AdminOperationsLanguages.test.js','v140 confirms approved and rejected actions']],
  'Admin can review barber status and approve/reject; full monitoring/alerts/operational SLA are NOT IMPLEMENTED/VERIFIED.'),
 spec(66,'Admin Booking Control Center',
  [['backend/controllers/adminBookingControlV164.js','function createHandlers(db)'],['backend/routes/admin.js',"router.get('/bookings/control'"],['frontend/src/pages/AdminBookingControlV164.jsx','bookingControlEndpointV164']],
  [['backend/test/v164AdminBookingControl.unit.test.js','v164: filters use positional SQL params'],['frontend/test/v164AdminBookingControl.test.js','v164: booking endpoint URL']],
  'Read-only, bounded booking investigation with status/day/barber filters. Administrative booking mutation, escalations, audit workflow, real PG and browser E2E remain NOT IMPLEMENTED/VERIFIED.'),
]);
export function auditAdminSeven({projectRoot=ROOT,registryPath=path.join(ROOT,'docs/USTARA_185_NAZORAT.csv')}={}){
 const previous=auditAvailabilitySeven({projectRoot,registryPath});
 if(previous.uniqueSourceTraces!==63)throw Error('v164 previous source trace count mismatch; NOT VERIFIED');
 const summary=summarizeDecisions(registryPath);
 if(previous.registrySha256!==summary.sha256)throw Error('v164 registry hash mismatch; NOT VERIFIED');
 const rows=parseCsv(fs.readFileSync(registryPath,'utf8').replace(/^\ufeff/,''));
 const seen=new Set();
 const decisions=NEXT_SEVEN.map(s=>{
  if(seen.has(s.id)||rows[s.id]?.[0]!==String(s.id)||rows[s.id]?.[1]!==s.title)throw Error('v164 original decision mismatch; NOT VERIFIED');
  seen.add(s.id);
  const code=s.code.map(([file,needle])=>assertEvidenceFile(projectRoot,file,needle).path);
  const tests=s.tests.map(([file,needle])=>assertEvidenceFile(projectRoot,file,needle).path);
  return {id:s.id,decision:s.title,originalStatus:rows[s.id][3],code,tests,
   sourceStatus:'PARTIAL_SOURCE_GAP',missingImplementation:[s.gap],productionVerified:false};
 });
 if(seen.size!==7||previous.uniqueSourceTraces+7!==70)throw Error('v164 unique count mismatch; NOT VERIFIED');
 return {version:'v164',totalDecisions:185,registrySha256:summary.sha256,
  previousSourceTraces:63,newSourceTraces:7,uniqueSourceTraces:70,notYetTraced:115,decisions,
  knownGaps:[...previous.knownGaps,...decisions.map(d=>({id:d.id,missingImplementation:d.missingImplementation}))],
  originalCounts:summary.counts,postgresE2E:'NOT_RUN',browserE2E:'NOT_RUN',telegramE2E:'NOT_RUN',
  releaseReadiness:'NOT_VERIFIED',productionReady:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=auditAdminSeven();if(process.argv.includes('--require-production'))throw Error('v164 PG/browser/production not verified');
  console.log(process.argv.includes('--json')?JSON.stringify(result,null,2):`v164 ${result.uniqueSourceTraces}/185 static traces; production NOT VERIFIED`);
 }catch(e){console.error(e.message);process.exitCode=1;}
}
