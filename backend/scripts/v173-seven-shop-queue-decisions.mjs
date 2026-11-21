// v173: source evidence for #123-#129. Coverage does not mean production-ready.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditSevenShops} from './v172-seven-shop-decisions.mjs';
import {assertEvidenceFile} from './v155-critical-decisions.mjs';
import {parseCsv,summarizeDecisions} from './v153-decision-progress.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const SPECS=Object.freeze([
 {id:123,title:'Sartaroshxona promo kampaniyalari',status:'NOT_IMPLEMENTED',gap:'Shop campaigns, budgets, eligibility and abuse controls are not implemented.'},
 {id:124,title:'Sartaroshxona galereyasi',status:'PARTIAL_SOURCE_GAP',code:[['backend/services/shopGalleryV173.js','validateGallery'],['backend/database/migrations/20261227_shop_gallery_posts.sql','REFERENCES social_posts(id) ON DELETE CASCADE'],['frontend/src/pages/shops/ShopGalleryV173.jsx','selectionV173'],['frontend/src/pages/shops/ShopPublicV172.jsx','current.shop.gallery']],tests:[['backend/test/v173ShopGallery.unit.test.js',"test('#124"],['frontend/test/v173ShopGallery.test.js',"test('#124"]],gap:'Curated image posts from one owner. Multi-staff galleries, video curation, admin moderation and real PostgreSQL/Browser E2E remain unverified.'},
 {id:125,title:'Sartaroshxona va barber baholari alohida',status:'NOT_IMPLEMENTED',gap:'Barber booking reviews exist, but salon-specific verified visits and separate rating rules do not.'},
 {id:126,title:'Umumiy va shaxsiy walk-in navbat',status:'PARTIAL_SOURCE_GAP',code:[['backend/controllers/walkinQueueController.js','callNext'],['backend/routes/queue.js',"'/manual/:id/leave'"]],tests:[['backend/test/walkinQueue.unit.test.js',"test("],['backend/test/manualQueueClaims.unit.test.js',"test("]],gap:'Individual barber walk-in only, no shared shop queue or permission-scoped routing; PG/E2E unverified.'},
 {id:127,title:'Navbat ETA va chaqiruv xabarlari',status:'PARTIAL_SOURCE_GAP',code:[['backend/services/queueLiveEstimate.js','estimateWait'],['backend/services/queueTelegramNotifications.js','createQueueTelegramService']],tests:[['backend/test/v90PublicQueueEstimate.unit.test.js',"test("],['backend/test/queueTelegramNotifications.unit.test.js',"test("]],gap:'Estimated wait is approximate; Telegram/outbox real integrations not proven and shop-wide queue not implemented.'},
 {id:128,title:'Navbatdan ixtiyoriy chiqish',status:'PARTIAL_SOURCE_GAP',code:[['backend/controllers/queueSelfExitController.js','leaveManual'],['backend/routes/queue.js',"'/qr-leave'"]],tests:[['backend/test/queueSelfExitV37.unit.test.js',"test("]],gap:'Personal QR/manual self-exit exists, but shop-wide queue and real PG/browser tests remain.'},
 {id:129,title:'Navbat chaqiruvi javob majburiy emas',status:'PARTIAL_SOURCE_GAP',code:[['backend/controllers/walkinQueueController.js','callNext'],['backend/controllers/queueTelegramController.js','module.exports']],tests:[['backend/test/walkinQueue.unit.test.js',"test("],['backend/test/queueTelegramNotifications.unit.test.js',"test("]],gap:'Call-next does not require customer acceptance; real Telegram and shop-specific queues unverified.'},
]);
export function auditSevenShopQueue({projectRoot=ROOT,registryPath=path.join(ROOT,'docs/USTARA_185_NAZORAT.csv')}={}){
 const old=auditSevenShops({projectRoot,registryPath});
 if(old.indexedTotal!==123)throw Error('v173 prior source reviews must be 123');
 const summary=summarizeDecisions(registryPath);
 if(old.registrySha256!==summary.sha256)throw Error('Original registry changed');
 const rows=parseCsv(fs.readFileSync(registryPath,'utf8').replace(/^\ufeff/,''));
 const decisions=SPECS.map(s=>{
  if(rows[s.id]?.[0]!==String(s.id)||rows[s.id]?.[1]!==s.title)throw Error(`v173 registry mismatch #${s.id}`);
  const code=(s.code||[]).map(([p,needle])=>assertEvidenceFile(projectRoot,p,needle).path);
  const tests=(s.tests||[]).map(([p,needle])=>assertEvidenceFile(projectRoot,p,needle).path);
  return {id:s.id,decision:s.title,originalStatus:rows[s.id][3],sourceStatus:s.status,code,tests,
   missingImplementation:[s.gap],productionVerified:false};
 });
 return {version:'v173',registrySha256:summary.sha256,totalDecisions:185,reviewedDecisions:7,
  previouslyIndexed:123,indexedNew:7,indexedTotal:130,notYetIndexed:55,
  sourcePartiallyImplemented:decisions.filter(d=>d.sourceStatus==='PARTIAL_SOURCE_GAP').length,
  requirementsNotImplemented:decisions.filter(d=>d.sourceStatus==='NOT_IMPLEMENTED').length,
  decisions,postgresE2E:'NOT_RUN',browserE2E:'NOT_RUN',productionReady:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const data=auditSevenShopQueue();if(process.argv.includes('--require-production'))throw Error('v173 production checks are missing');
  console.log(process.argv.includes('--json')?JSON.stringify(data,null,2):`v173: ${data.indexedTotal}/185 reviewed; NOT production complete`);
 }catch(e){console.error(e.stack);process.exitCode=1;}
}
