// v168: exactly original #88-#94 source references; NOT production certification.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditSevenSocial} from './v167-seven-social-security-decisions.mjs';
import {assertEvidenceFile,auditCriticalDecisions} from './v155-critical-decisions.mjs';
import {summarizeDecisions,parseCsv} from './v153-decision-progress.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const item=(id,title,code,tests,gap)=>({id,title,code,tests,gap});
export const SEVEN=Object.freeze([
 item(88,'Mijoz bron izohi va ilova rasmi',
  [['backend/controllers/bookingsController.js','async'],['frontend/src/pages/user/barber/InlineBooking.jsx','async function confirm']],
  [['frontend/test/createBooking.test.js','test(']],
  'Booking creation is present, but persisted customer note/photo upload, validation, consent and secure retention NOT IMPLEMENTED.'),
 item(89,'Smart Review kriteriyalar va moderatsiya',
  [['backend/controllers/reviewsController.js','async function create'],['frontend/src/pages/barber/Reviews.jsx','rating']],
  [['backend/test/v168ReviewSources.unit.test.js',"test('#89"]],
  'Completed-booking 1–5 ratings exist; structured criteria, fraud controls, review appeals and moderation workflow NOT IMPLEMENTED.'),
 item(90,'Advanced Break Manager',
  [['backend/controllers/breakRulesController.js','createHandlers'],['frontend/src/pages/barber/Schedule.jsx','RecurringBreaksEditor']],
  [['backend/test/breakRules.unit.test.js','test(']],
  'Weekly/dated breaks exist; live DB race and scheduling edge E2E NOT VERIFIED.'),
 item(91,'Portfolio tartibi va 6 ta pinned ish',
  [['backend/controllers/portfolioFeaturedV168.js','FOR UPDATE OF b'],['backend/controllers/socialController.js','p.featured_at DESC NULLS LAST'],['frontend/src/pages/barber/Portfolio.jsx','setPortfolioFeatured']],
  [['backend/test/v168PortfolioFeatured.unit.test.js',"test('#91"],['frontend/test/v168FeaturedPortfolio.test.js',"test('#91"]],
  'Server feature cap 6, ownership and public-first sort added. Manual drag/drop reorder, real PostgreSQL concurrency and browser E2E NOT VERIFIED.'),
 item(92,'7 kunlik Smart Availability Explorer',
  [['frontend/src/pages/user/barber/weeklyAvailability.js','watchAvailabilityWeek'],['frontend/src/pages/user/barber/InlineBooking.jsx','nextVerifiedAvailableDay']],
  [['frontend/test/v117WeeklyAvailability.test.js','test(']],
  'Seven-day read-only availability exists but each slot must be requoted; real schedule DB and full browser E2E NOT VERIFIED.'),
 item(93,'Profilni mijoz ko‘rinishida tekshirish',
  [['frontend/src/pages/barber/components/PublicProfilePreviewCard.jsx','PublicProfilePreviewCard'],['frontend/src/pages/barber/Portfolio.jsx','<PublicProfilePreviewCard']],
  [['frontend/test/v130ProfileIssueExperience.test.js','test(']],
  'Barber preview card exists; guaranteed exact customer-route pixel parity NOT VERIFIED.'),
 item(94,'Adolatli Smart Ranking',
  [['frontend/src/pages/user/explore/catalog.js','searchScore'],['frontend/src/pages/user/explore/homeModel.js','rankBarbers']],
  [['frontend/test/v121ExploreSortProfile.test.js','test(']],
  'Deterministic relevance/distance and followed-first sorting exist; fairness assessment, sponsor separation audit and ranking bias E2E NOT VERIFIED.'),
]);
export function auditSevenPortfolio({projectRoot=ROOT,registryPath=path.join(ROOT,'docs/USTARA_185_NAZORAT.csv')}={}) {
 const prev=auditSevenSocial({projectRoot,registryPath});
 if(prev.uniqueSourceTraces!==89)throw Error('v168 expected 89 prior source traces; NOT VERIFIED');
 const summary=summarizeDecisions(registryPath);
 if(prev.registrySha256!==summary.sha256)throw Error('v168 original registry mismatch; NOT VERIFIED');
 const critical=auditCriticalDecisions({projectRoot,registryPath});
 const already=new Set([...critical.decisions.map(d=>d.id),...prev.decisions.map(d=>d.id)]);
 const rows=parseCsv(fs.readFileSync(registryPath,'utf8').replace(/^\ufeff/,''));
 const seen=new Set();
 const decisions=SEVEN.map(spec=>{
   if(seen.has(spec.id)||rows[spec.id]?.[0]!==String(spec.id)||rows[spec.id]?.[1]!==spec.title)
     throw Error(`v168 original decision #${spec.id} mismatch; NOT VERIFIED`);
   seen.add(spec.id);
   const code=spec.code.map(([file,token])=>assertEvidenceFile(projectRoot,file,token).path);
   const tests=spec.tests.map(([file,token])=>assertEvidenceFile(projectRoot,file,token).path);
   return {id:spec.id,decision:spec.title,originalStatus:rows[spec.id][3],code,tests,
      sourceStatus:already.has(spec.id)?'ALREADY_INDEXED_PARTIAL':'PARTIAL_SOURCE_GAP',
      missingImplementation:[spec.gap],productionVerified:false};
 });
 const alreadyIndexed=decisions.filter(d=>already.has(d.id)).map(d=>d.id);
 const newSourceTraces=decisions.length-alreadyIndexed.length;
 const uniqueSourceTraces=prev.uniqueSourceTraces+newSourceTraces;
 return {version:'v168',totalDecisions:185,registrySha256:summary.sha256,
  reviewedDecisions:7,previousSourceTraces:prev.uniqueSourceTraces,alreadyIndexed,
  newSourceTraces,uniqueSourceTraces,notYetTraced:185-uniqueSourceTraces,
  decisions,originalCounts:summary.counts,postgresE2E:'NOT_RUN',browserE2E:'NOT_RUN',
  bookingPhotoNote:'NOT_IMPLEMENTED',structuredReviews:'NOT_IMPLEMENTED',
  rankingFairness:'NOT_VERIFIED',productionReady:false,releaseReadiness:'NOT_VERIFIED'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=auditSevenPortfolio();
  if(process.argv.includes('--require-production'))throw Error('v168 production NOT VERIFIED');
  console.log(process.argv.includes('--json')?JSON.stringify(result,null,2):
    `v168: reviewed 7, new ${result.newSourceTraces}, unique ${result.uniqueSourceTraces}/185, production NOT VERIFIED`);
 }catch(e){console.error(e.message);process.exitCode=1;}
}
