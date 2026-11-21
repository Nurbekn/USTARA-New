// v179: source evidence, not an integration or deployment certificate.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditSevenPhoneDistrictDecisions} from './v178-seven-phone-district-decisions.mjs';
import {assertEvidenceFile} from './v155-critical-decisions.mjs';
import {parseCsv,summarizeDecisions} from './v153-decision-progress.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const SPECS=Object.freeze([
 {id:165,title:'Smart Link Preview',status:'PARTIAL_SOURCE_GAP',
  code:[['backend/services/publicProfilePreview.js','renderPreviewHtml'],['backend/controllers/publicProfilePreview.js','createPublicPreviewHandler'],['frontend/src/pages/user/barber/publicShare.js','preview']],
  tests:[['backend/test/v135PublicPreview.unit.test.js',"test('public preview"],['frontend/test/v135PublicLinkPreview.test.js','test(']],
  gap:'A sanitized public profile OG/Twitter preview exists for approved active barbers. External Telegram/WhatsApp crawler fetch, HTTPS domain, SPA deep link and CDN caching are unverified.'},
 {id:166,title:'Takroriy akkaunt va sartaroshxona rad etiladi',status:'PARTIAL_SOURCE_GAP',
  code:[['backend/database/migrations/20261113_unified_accounts.sql','users_phone_unique'],['backend/database/migrations/20261226_single_address_barber_shops.sql','owner_barber_id INTEGER NOT NULL UNIQUE']],
  tests:[['backend/test/v172SingleAddressShop.unit.test.js',"test('#120 write: owner"]],
  gap:'Canonical users.phone and one shop per barber have unique constraints. Duplicate organizations with different owners/addresses are not reliably detected and should not be automatically merged. Real PostgreSQL concurrency unverified.'},
 {id:167,title:'Ish vaqtini uzaytirish maxsus workflow BEKOR',status:'CANCELLED_BY_USER',
  gap:'The dedicated workday-extension workflow was cancelled by user decision and must not be reintroduced.'},
 {id:168,title:'Faqat o‘zi uchun bron qilish',status:'PARTIAL_SOURCE_GAP',
  code:[['backend/services/multiBooking.js',"VALUES($1,$2,$3,$4,$5,$6,'confirmed')"],['backend/controllers/bookingsController.js','const customer_id = req.user.profileId']],
  tests:[['backend/test/bookings.unit.test.js',"test("]],
  gap:'Customer booking uses the authenticated profile ID, not a submitted customer identity. Separate planned phone/manual bookings are not part of this flow. Real PostgreSQL/browser cross-account checks unverified.'},
 {id:169,title:'Mijozning vaqt to‘qnashuvchi bronlari taqiqlanadi',status:'PARTIAL_SOURCE_GAP',
  code:[['backend/services/multiBooking.js',"'customer_time_conflict'"],['backend/database/migrations/20261130_customer_time_overlap.sql','customer_id public.gist_int4_ops WITH =']],
  tests:[['backend/test/bookingConcurrency.postgres.integration.test.js','customer_time_conflict']],
  gap:'Application conflict checks and PostgreSQL exclusion constraint exist; database test is present but was not executed on a live database in this release.'},
 {id:170,title:'Barber matching qayta muhokamasi BEKOR',status:'CANCELLED_BY_USER',
  gap:'User cancelled the additional matching re-discussion; do not invent an automatic matching workflow.'},
 {id:171,title:'Portfolio muallifi ko‘rsatiladi',status:'PARTIAL_SOURCE_GAP',
  code:[['backend/services/shopGalleryV173.js','b.first_name AS author_first_name'],['frontend/src/pages/shops/ShopPublicV172.jsx','galleryUi.author'],['frontend/src/pages/user/social/PostCard.jsx','authorName(author)']],
  tests:[['backend/test/v179GalleryAttribution.unit.test.js',"test('#171"],['frontend/test/v179PortfolioAttribution.test.js',"test('#171"]],
  gap:'Server-sourced author credit now appears on the public shop gallery and already exists on Ilhom posts. A shop currently has one owner, not verified multi-staff authors; real database/browser E2E remains untested.'},
]);
export function auditSevenIdentitySocialDecisions({projectRoot=ROOT,registryPath=path.join(ROOT,'docs/USTARA_185_NAZORAT.csv')}={}){
 const previous=auditSevenPhoneDistrictDecisions({projectRoot,registryPath});
 if(previous.indexedTotal!==165)throw Error('v179 must follow 165 reviewed decisions');
 const summary=summarizeDecisions(registryPath);
 if(previous.registrySha256!==summary.sha256)throw Error('Source registry changed');
 const rows=parseCsv(fs.readFileSync(registryPath,'utf8').replace(/^\ufeff/,''));
 const decisions=SPECS.map(spec=>{
  if(rows[spec.id]?.[0]!==String(spec.id)||rows[spec.id]?.[1]!==spec.title)
   throw Error(`Source registry mismatch #${spec.id}`);
  return {id:spec.id,decision:spec.title,originalStatus:rows[spec.id][3],sourceStatus:spec.status,
   code:(spec.code||[]).map(([p,needle])=>assertEvidenceFile(projectRoot,p,needle).path),
   tests:(spec.tests||[]).map(([p,needle])=>assertEvidenceFile(projectRoot,p,needle).path),
   missingImplementation:[spec.gap],productionVerified:false};
 });
 return {version:'v179',registrySha256:summary.sha256,totalDecisions:185,reviewedDecisions:7,
  previouslyIndexed:165,indexedNew:7,indexedTotal:172,notYetIndexed:13,
  sourcePartiallyImplemented:decisions.filter(x=>x.sourceStatus==='PARTIAL_SOURCE_GAP').length,
  requirementsNotImplemented:decisions.filter(x=>x.sourceStatus==='NOT_IMPLEMENTED').length,
  explicitlyCancelled:decisions.filter(x=>x.sourceStatus==='CANCELLED_BY_USER').length,
  decisions,postgresE2E:'NOT_RUN',browserE2E:'NOT_RUN',telegramCrawler:'NOT_RUN',productionReady:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=auditSevenIdentitySocialDecisions();
  if(process.argv.includes('--require-production'))throw Error('Integration tests not completed');
  console.log(process.argv.includes('--json')?JSON.stringify(result,null,2):`v179: ${result.indexedTotal}/185 source-reviewed, NOT production verified`);
 }catch(error){console.error(error.stack);process.exitCode=1;}
}
