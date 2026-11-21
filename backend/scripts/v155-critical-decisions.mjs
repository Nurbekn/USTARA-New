// v155: trace EXACTLY seven agreed decisions to real source/test references.
// This is a source-evidence index, NOT a declaration of DB, browser, Telegram or production completion.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {summarizeDecisions,parseCsv} from './v153-decision-progress.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const original=path.join(ROOT,'docs/USTARA_185_NAZORAT.csv');

// Each mapping is manually reviewed against the original decision wording.
// Needles verify evidence was not replaced by a blank/unrelated file.
export const CRITICAL=Object.freeze([
 Object.freeze({id:5,title:'Bir nechta xizmatni bir bron bilan olish',
  code:[['backend/services/multiBooking.js','booking_services('],['frontend/src/pages/queue/serviceBundle.js','offerBundle']],
  tests:[['backend/test/smartBookingConfirmation.unit.test.js','test('],['frontend/test/serviceBundle.test.js','test(']]}),
 Object.freeze({id:6,title:'Bitta sahifadagi kalendar va 5 daqiqalik slotlar',
  code:[['backend/services/slotGrid.js','slotCandidates'],['frontend/src/pages/user/barber/availableSlots.js','loadAvailableSlots']],
  tests:[['frontend/test/availableSlots.test.js','test('],['frontend/test/v84SlotQuoteIntegrity.test.js','test(']]}),
 Object.freeze({id:27,title:'Mijoz jonli navbati va joyidagi QR',
  code:[['backend/services/v154PublicQueueLink.js','publicQueueLink'],['frontend/src/pages/queue/QueueCheckIn.jsx','isValidQrToken']],
  tests:[['backend/test/v154QrPagesLinks.unit.test.js','test('],['frontend/test/v154QrSiteDestination.test.js','test(']]}),
 Object.freeze({id:75,title:'Smart Support yordam markazi',
  code:[['frontend/src/pages/help/HelpCenter.jsx','HelpCenter'],['frontend/src/pages/help/helpModel.js','HELP_TOPICS']],
  tests:[['frontend/test/v137HelpCenter.test.js','test('],['frontend/test/v138HelpLanguages.test.js','test(']]}),
 Object.freeze({id:76,title:'O‘zbek rus ingliz tillari va Admin tarjimasi',
  code:[['frontend/src/utils/siteLocale.js','SITE_LANGUAGES'],['frontend/src/pages/adminLanguage.js','ru:']],
  tests:[['frontend/test/v151DocumentLocale.test.js','test('],['frontend/test/v138HelpLanguages.test.js','test(']]}),
 Object.freeze({id:107,title:'Ommaviy profil havolasini ko‘rish',
  code:[['frontend/src/pages/user/barber/publicShare.js','canonicalPublicBarberUrl'],['frontend/src/pages/user/barber/PublicProfileShare.jsx','sharePublicBarberProfile']],
  tests:[['frontend/test/v136ShareBasePath.test.js','test(']]}),
 Object.freeze({id:165,title:'Smart Link Preview',
  code:[['backend/services/publicProfilePreview.js','og:title'],['backend/controllers/publicProfilePreview.js','getPublic']],
  tests:[['backend/test/v135PublicPreview.unit.test.js','test(']]}),
]);

// Realpath, no symlinks, nonempty regular file, and token check; never access paths outside the project.
export function assertEvidenceFile(projectRoot,relative,needle){
 if(typeof relative!=='string'||!relative||relative.includes('\\')||relative.startsWith('/')||
    relative.split('/').some(x=>!x||x==='.'||x==='..')||
    typeof needle!=='string'||!needle)throw Error('v155: unsafe evidence reference; NOT VERIFIED');
 const root=fs.realpathSync(projectRoot),file=path.resolve(root,relative);
 if(!file.startsWith(root+path.sep))throw Error('v155: outside project evidence; NOT VERIFIED');
 let stats;
 try{stats=fs.lstatSync(file);}catch{throw Error('v155: missing evidence: '+relative+'; NOT VERIFIED');}
 if(!stats.isFile()||stats.isSymbolicLink()||stats.size<10||stats.size>4_000_000||
    fs.realpathSync(file)!==file)throw Error('v155: unsafe or empty evidence: '+relative+'; NOT VERIFIED');
 const content=fs.readFileSync(file,'utf8');
 if(!content.includes(needle))throw Error('v155: evidence contract drift: '+relative+'; NOT VERIFIED');
 return {path:relative,sha256:undefined};
}
export function auditCriticalDecisions({projectRoot=ROOT,registryPath=original}={}){
 const base=summarizeDecisions(registryPath); // requires exact original bytes, 185 decisions
 const rows=parseCsv(fs.readFileSync(registryPath,'utf8').replace(/^\ufeff/,''));
 const decisions=CRITICAL.map(spec=>{
  const entry=rows[spec.id];
  if(entry?.[0]!==String(spec.id)||entry?.[1]!==spec.title)
   throw Error('v155: decision mapping no longer matches the original agreement; NOT VERIFIED');
  const code=spec.code.map(([file,needle])=>assertEvidenceFile(projectRoot,file,needle).path);
  const tests=spec.tests.map(([file,needle])=>assertEvidenceFile(projectRoot,file,needle).path);
  if(code.length<2||tests.length<1)throw Error('v155: incomplete evidence references; NOT VERIFIED');
  return {id:spec.id,decision:entry[1],originalStatus:entry[3],code,tests,
   sourceStatus:'REFERENCES_PRESENT_ONLY',unitExecution:'NOT_INFERRED',
   postgresE2E:'NOT_RUN',browserE2E:'NOT_RUN',productionVerified:false};
 });
 return {version:'v155',registrySha256:base.sha256,totalDecisions:185,
  auditedDecisions:decisions.length,unreviewedDecisions:185-decisions.length,
  originalCounts:base.counts,decisions,releaseReadiness:'NOT_VERIFIED',productionReady:false,
  note:'Evidence paths are pointers for review; not proof of runtime behavior, deployment or completed decisions.'};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 try{
  const result=auditCriticalDecisions();
  if(process.argv.includes('--require-production'))throw Error('v155: actual PG, Chrome and release evidence not supplied; NOT VERIFIED');
  console.log(process.argv.includes('--json')?JSON.stringify(result,null,2):
   `v155: ${result.auditedDecisions}/185 source/test mappings found; runtime NOT VERIFIED`);
 }catch(e){console.error(e.message);process.exitCode=1;}
}
