// #109-#115: explicit review inventory. Indexing a decision does NOT imply implementation.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditSevenCheckinProfile} from './v170-seven-checkin-profile-decisions.mjs';
import {assertEvidenceFile} from './v155-critical-decisions.mjs';
import {summarizeDecisions,parseCsv} from './v153-decision-progress.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const SPECS=Object.freeze([
 {id:109,title:'Sartarosh About, tajriba, sertifikat',code:[['backend/services/barberProfile.js','normalizeCertificates'],['frontend/src/pages/barber/Profile.jsx','bx-certificates-v171'],['frontend/src/pages/user/barber/BarberPublicProfile.jsx','bpv-certificates-v171']],tests:[['backend/test/v171BarberCertificates.unit.test.js',"test('#109"],['frontend/test/v171Certificates.test.js',"test('#109"]],status:'PARTIAL_SOURCE_GAP',gap:'Self-reported certificates added; no evidence upload, approval workflow, or live DB/browser E2E. Profile badge verification is separate.'},
 {id:110,title:'Bir sartarosh uchun ko‘p ish joyi',status:'NOT_IMPLEMENTED',gap:'One barber has one current address/location; no per-workplace booking location and slot override.'},
 {id:111,title:'Ko‘p xodimli sartaroshxona tashkiloti',status:'NOT_IMPLEMENTED',gap:'No organization entity, ownership ledger, multi-barber tenancy or salon membership model.'},
 {id:112,title:'Egasi menejer sartarosh ruxsatlari',status:'NOT_IMPLEMENTED',gap:'No tenant-scoped owner/manager/member permissions or role revocation.'},
 {id:113,title:'Mavjud akkauntni jamoaga taklif',status:'NOT_IMPLEMENTED',gap:'No secure existing-account invitation and acceptance lifecycle.'},
 {id:114,title:'Xodimni jamoatdan xavfsiz chiqarish',status:'NOT_IMPLEMENTED',gap:'No membership revoke/reassign flow preserving booked appointments and audit.'},
 {id:115,title:'Jamoa umumiy bron jadvali',status:'NOT_IMPLEMENTED',gap:'Current barber booking calendar is personal; no tenant-wide scoped read or authorization.'},
]);
export function auditSevenBarberTeam({projectRoot=ROOT,registryPath=path.join(ROOT,'docs/USTARA_185_NAZORAT.csv')}={}){
 const prev=auditSevenCheckinProfile({projectRoot,registryPath});
 if(prev.uniqueSourceTraces!==109)throw Error('v171 requires 109 prior indexed decision reviews');
 const summary=summarizeDecisions(registryPath);
 if(prev.registrySha256!==summary.sha256)throw Error('Original decision registry changed');
 const rows=parseCsv(fs.readFileSync(registryPath,'utf8').replace(/^\ufeff/,''));
 const decisions=SPECS.map(s=>{
  if(rows[s.id]?.[0]!==String(s.id)||rows[s.id]?.[1]!==s.title)throw Error(`v171 registry mismatch #${s.id}`);
  const code=(s.code||[]).map(([p,needle])=>assertEvidenceFile(projectRoot,p,needle).path);
  const tests=(s.tests||[]).map(([p,needle])=>assertEvidenceFile(projectRoot,p,needle).path);
  return {id:s.id,decision:s.title,originalStatus:rows[s.id][3],sourceStatus:s.status,code,tests,
   missingImplementation:[s.gap],productionVerified:false};
 });
 return {version:'v171',registrySha256:summary.sha256,totalDecisions:185,reviewedDecisions:7,
  previouslyIndexed:prev.uniqueSourceTraces,indexedNew:7,indexedTotal:116,notYetIndexed:69,
  sourceImplemented:decisions.filter(d=>d.sourceStatus==='PARTIAL_SOURCE_GAP').length,
  requirementsNotImplemented:decisions.filter(d=>d.sourceStatus==='NOT_IMPLEMENTED').length,
  decisions,postgresE2E:'NOT_RUN',browserE2E:'NOT_RUN',productionReady:false,releaseReadiness:'NOT_VERIFIED'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const r=auditSevenBarberTeam();if(process.argv.includes('--require-production'))throw Error('Production evidence is missing');
  console.log(process.argv.includes('--json')?JSON.stringify(r,null,2):`v171: ${r.indexedTotal}/185 reviewed, ${r.requirementsNotImplemented} of this batch NOT IMPLEMENTED`);
 }catch(e){console.error(e.message);process.exitCode=1;}
}
