// Seven ADDITIONAL unverified decisions traced to source/test references.
// Source-only evidence, never proof of working production or completion.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditCriticalDecisions,assertEvidenceFile} from './v155-critical-decisions.mjs';
import {parseCsv,summarizeDecisions} from './v153-decision-progress.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const SEVEN=Object.freeze([
 {id:1,title:'Bosh sahifa kartalari adaptiv',code:[['frontend/src/pages/user/UserHome.jsx','uh-style-gallery'],['frontend/src/pages/user/UserHome.css','.uh-style']],tests:[['frontend/test/customerHome.test.js','test(']]},
 {id:2,title:'Sartarosh bosh paneli',code:[['frontend/src/pages/barber/Dashboard.jsx','getRatingSummary'],['frontend/src/pages/barber/data/earnings.js','export']],tests:[['frontend/test/v147BarberInsightsLanguages.test.js','test(']]},
 {id:3,title:'Instagram uslubidagi sartarosh profili',code:[['frontend/src/pages/user/barber/BarberPublicProfile.jsx','ProfileContent'],['frontend/src/pages/user/barber/publicShare.js','canonicalPublicBarberUrl']],tests:[['frontend/test/publicProfile.test.js','test(']]},
 {id:4,title:'Ilhom tasma postlari va reaksiyalari',code:[['frontend/src/pages/user/Social.jsx','loadSocial'],['frontend/src/pages/user/social/model.js','loadSocial']],tests:[['frontend/test/socialModel.test.js','test(']]},
 {id:7,title:'Platforma Admin boshqaruv markazi',code:[['frontend/src/pages/AdminPanel.jsx','AdminPanel'],['frontend/src/pages/adminLanguage.js','admin']],tests:[['frontend/test/v139AdminLanguages.test.js','test(']]},
 {id:8,title:'Kunlik jadval tanaffus va maxsus kunlar',code:[['frontend/src/pages/barber/components/CalendarExceptionsEditor.jsx','calendarDates'],['frontend/src/pages/barber/data/calendarExceptions.js','calendarDates']],tests:[['frontend/test/calendarExceptions.test.js','test(']]},
 {id:9,title:'Sartarosh bronlar ro‘yxati va kalendari',code:[['frontend/src/pages/barber/Bookings.jsx','STATUS.PENDING'],['frontend/src/pages/barber/components/BookingCard.jsx','BookingCard']],tests:[['frontend/test/v147BarberInsightsLanguages.test.js','test(']]},
]);
export function auditNextSeven({projectRoot=ROOT,registryPath=path.join(ROOT,'docs/USTARA_185_NAZORAT.csv')}={}){
 const original=summarizeDecisions(registryPath);
 const prev=auditCriticalDecisions({projectRoot,registryPath});
 const rows=parseCsv(fs.readFileSync(registryPath,'utf8').replace(/^\ufeff/,''));
 const previous=new Set(prev.decisions.map(x=>x.id)),more=new Set();
 const decisions=SEVEN.map(spec=>{
  if(previous.has(spec.id)||more.has(spec.id)||rows[spec.id]?.[0]!==String(spec.id)||rows[spec.id]?.[1]!==spec.title)
   throw Error('v156: decision mapping changed or duplicate; NOT VERIFIED');
  more.add(spec.id);
  const code=spec.code.map(([p,needle])=>assertEvidenceFile(projectRoot,p,needle).path);
  const tests=spec.tests.map(([p,needle])=>assertEvidenceFile(projectRoot,p,needle).path);
  if(code.length<2||tests.length<1)throw Error('v156: insufficient source references; NOT VERIFIED');
  return {id:spec.id,decision:spec.title,originalStatus:rows[spec.id][3],code,tests,
   sourceStatus:'REFERENCES_PRESENT_ONLY',productionVerified:false};
 });
 return {version:'v156',registrySha256:original.sha256,totalDecisions:185,
  previousSourceTraces:previous.size,newSourceTraces:decisions.length,
  uniqueSourceTraces:previous.size+decisions.length,notYetTraced:185-previous.size-decisions.length,
  decisions,originalCounts:original.counts,postgresE2E:'NOT_RUN',browserE2E:'NOT_RUN',
  releaseReadiness:'NOT_VERIFIED',productionReady:false};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 try{
  const r=auditNextSeven();
  if(process.argv.includes('--require-production'))throw Error('v156: PG/Chrome/production unverified; NOT VERIFIED');
  console.log(process.argv.includes('--json')?JSON.stringify(r,null,2):
   `v156: ${r.uniqueSourceTraces}/185 source/test references found; production NOT VERIFIED`);
 }catch(e){console.error(e.message);process.exitCode=1;}
}
