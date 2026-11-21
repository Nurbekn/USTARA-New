// v172 review: tracing code/test evidence is NOT a claim of finished functionality.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditSevenBarberTeam} from './v171-seven-barber-team-decisions.mjs';
import {assertEvidenceFile} from './v155-critical-decisions.mjs';
import {summarizeDecisions,parseCsv} from './v153-decision-progress.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const SPECS=Object.freeze([
 {id:116,title:'Sartaroshxona analitikasi',status:'NOT_IMPLEMENTED',gap:'Shop-level aggregate bookings/revenue, access checks and no-payment disclosure are not implemented.'},
 {id:117,title:'Jamoa smenalari va tasdiqlash',status:'NOT_IMPLEMENTED',gap:'No staff membership, shift requests, approval or schedule collision handling.'},
 {id:118,title:'Jamoa ichidagi e’tirof',status:'NOT_IMPLEMENTED',gap:'No team identity, recognition abuse guards or moderation.'},
 {id:119,title:'O‘zbekiston uchun sodda bitta manzilli shop',status:'PARTIAL_SOURCE_GAP',code:[['backend/services/singleAddressShopV172.js','normalizeShop'],['backend/database/migrations/20261226_single_address_barber_shops.sql','owner_barber_id INTEGER NOT NULL UNIQUE'],['frontend/src/pages/shops/ShopEditV172.jsx','shop-v172-form']],tests:[['backend/test/v172SingleAddressShop.unit.test.js',"test('#119"],['frontend/test/v172Shops.test.js',"test('#119"]],gap:'Single-owner, one-address profile foundation only. No multi-staff shop, business verification, PostgreSQL/browser E2E or complete deletion governance.'},
 {id:120,title:'Sartaroshxona ommaviy profili',status:'PARTIAL_SOURCE_GAP',code:[['backend/services/singleAddressShopV172.js','publicShop'],['backend/routes/shops.js',"routes.get('/:id'"],['frontend/src/pages/shops/ShopPublicV172.jsx','shop-v172']],tests:[['backend/test/v172SingleAddressShop.unit.test.js',"test('#120"],['frontend/test/v172Shops.test.js',"test('#120"]],gap:'Owner-edited guest public profile only; no gallery, team members, salon ratings or shop verification workflow. Owner display is not shop verification.'},
 {id:121,title:'Mijoz tasdiqlaydigan barber matching',status:'PARTIAL_SOURCE_GAP',code:[['frontend/src/pages/user/Explore.jsx','ComparisonPanel'],['frontend/src/pages/user/barber/InlineBooking.jsx','barber']],tests:[['frontend/test/v121ExploreSortProfile.test.js','test(']],gap:'Manual comparison and explicit barber booking exist; no automatic multi-staff barber matching, customer approval handoff, or E2E.'},
 {id:122,title:'Jamoa xizmat katalogi va individual narxlar',status:'NOT_IMPLEMENTED',gap:'Personal barber services exist; no tenant catalog, per-member price overrides, or shop-specific booking snapshot.'},
]);
export function auditSevenShops({projectRoot=ROOT,registryPath=path.join(ROOT,'docs/USTARA_185_NAZORAT.csv')}={}){
 const previous=auditSevenBarberTeam({projectRoot,registryPath});
 if(previous.indexedTotal!==116)throw Error('v172 expected 116 prior unique decision reviews');
 const summary=summarizeDecisions(registryPath);if(previous.registrySha256!==summary.sha256)throw Error('v172 registry was modified');
 const rows=parseCsv(fs.readFileSync(registryPath,'utf8').replace(/^\ufeff/,''));
 const decisions=SPECS.map(s=>{
  if(rows[s.id]?.[0]!==String(s.id)||rows[s.id]?.[1]!==s.title)throw Error(`v172 registry mismatch #${s.id}`);
  const code=(s.code||[]).map(([p,needle])=>assertEvidenceFile(projectRoot,p,needle).path);
  const tests=(s.tests||[]).map(([p,needle])=>assertEvidenceFile(projectRoot,p,needle).path);
  return {id:s.id,decision:s.title,originalStatus:rows[s.id][3],sourceStatus:s.status,code,tests,
   missingImplementation:[s.gap],productionVerified:false};
 });
 return {version:'v172',registrySha256:summary.sha256,totalDecisions:185,reviewedDecisions:7,
  previouslyIndexed:116,indexedNew:7,indexedTotal:123,notYetIndexed:62,
  sourcePartiallyImplemented:decisions.filter(d=>d.sourceStatus==='PARTIAL_SOURCE_GAP').length,
  requirementsNotImplemented:decisions.filter(d=>d.sourceStatus==='NOT_IMPLEMENTED').length,
  decisions,postgresE2E:'NOT_RUN',browserE2E:'NOT_RUN',productionReady:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=auditSevenShops();if(process.argv.includes('--require-production'))throw Error('v172 production evidence missing');
  console.log(process.argv.includes('--json')?JSON.stringify(result,null,2):`v172: ${result.indexedTotal}/185 reviewed (NOT production complete)`);
 }catch(e){console.error(e.stack);process.exitCode=1;}
}
