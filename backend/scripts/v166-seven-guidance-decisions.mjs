// v166: original decision #74–#80 SOURCE audit. It never certifies production readiness.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditSevenOperations } from './v165-seven-operations-decisions.mjs';
import { auditCriticalDecisions, assertEvidenceFile } from './v155-critical-decisions.mjs';
import { summarizeDecisions, parseCsv } from './v153-decision-progress.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const item = (id, title, code, tests, gap) => ({ id, title, code, tests, gap });
export const SEVEN = Object.freeze([
  item(74, 'Ixtiyoriy onboarding',
    [['frontend/src/components/onboarding/ContextGuideV166.jsx','aria-expanded={expanded}'],['frontend/src/pages/help/HelpCenter.jsx','showIntro']],
    [['frontend/test/v166ContextGuide.test.js','v166 #74']],
    'Optional inline help exists; real first-time usability and browser E2E NOT VERIFIED.'),
  item(75, 'Smart Support yordam markazi',
    [['frontend/src/pages/help/HelpCenter.jsx','findHelpTopics'],['frontend/src/pages/help/helpModel.js','HELP_TOPICS']],
    [['frontend/test/v137HelpCenter.test.js','test(']],
    'Already indexed in v155; static translated help/search only, no verified AI assistant, live agent or support ticket lifecycle.'),
  item(76, 'O‘zbek rus ingliz tillari va Admin tarjimasi',
    [['frontend/src/utils/siteLocale.js','SITE_LANGUAGES'],['frontend/src/pages/AdminPanel.jsx','readAdminLocale']],
    [['frontend/test/v141SiteShellLanguages.test.js','v141 #76']],
    'Already indexed in v155; source translations exist, complete end-to-end browser language coverage NOT VERIFIED.'),
  item(77, 'Mavjud signup va qisqa onboarding',
    [['frontend/src/pages/auth/components/RegistrationForm.jsx','startRegistration'],['frontend/src/App.jsx','<Route path="/otp"']],
    [['frontend/test/v166ContextGuide.test.js','one optional guidance widget']],
    'Existing OTP registration is unchanged; real signup OTP integration, short onboarding browser flow NOT VERIFIED.'),
  item(78, 'Kontekst onboarding ko‘rsatmalari',
    [['frontend/src/components/onboarding/guideModelV166.js','guideSectionV166'],['frontend/src/layouts/UserLayout.jsx','<ContextGuideV166'],['frontend/src/layouts/BarberLayout.jsx','<ContextGuideV166']],
    [['frontend/test/v166ContextGuide.test.js','v166 #78']],
    'Per-page advisory UI exists; no browser accessibility audit or proven first-run comprehension.'),
  item(79, 'Media optimallashtirish',
    [['frontend/src/pages/user/social/MediaGallery.jsx','decoding="async"'],['frontend/src/pages/user/barber/BarberPublicProfile.jsx','preload={thumbnail ? "none" : "metadata"}']],
    [['frontend/test/v166ContextGuide.test.js','v166 #79']],
    'Lazy images and metadata deferral only; CDN, thumbnails, responsive variants, upload processing and actual device/network benchmarks NOT VERIFIED.'),
  item(80, 'Shaxsiy va hamkorlikdagi to‘plamlar',
    [['frontend/src/pages/user/Social.jsx','savedPostIds'],['frontend/src/pages/user/social/model.js','setSocialSave']],
    [['frontend/test/v166DecisionGaps.test.js','v166 #80']],
    'Only existing saved-post list found. Named/private/shared collections, invitations, permissions and collaboration are NOT IMPLEMENTED.'),
]);
export function auditSevenGuidance({ projectRoot = ROOT, registryPath = path.join(ROOT, 'docs/USTARA_185_NAZORAT.csv') } = {}) {
  const prev = auditSevenOperations({ projectRoot, registryPath });
  if (prev.uniqueSourceTraces !== 77) throw Error('v166 expected 77 prior traces; NOT VERIFIED');
  const summary = summarizeDecisions(registryPath);
  if (prev.registrySha256 !== summary.sha256) throw Error('v166 original registry mismatch; NOT VERIFIED');
  const critical = auditCriticalDecisions({ projectRoot, registryPath });
  const alreadyIndexed = new Set(critical.decisions.map(x => x.id));
  const rows = parseCsv(fs.readFileSync(registryPath, 'utf8').replace(/^\ufeff/, ''));
  const seen = new Set();
  const decisions = SEVEN.map(spec => {
    if (seen.has(spec.id) || rows[spec.id]?.[0] !== String(spec.id) || rows[spec.id]?.[1] !== spec.title) {
      throw Error(`v166 original decision #${spec.id} mismatch; NOT VERIFIED`);
    }
    seen.add(spec.id);
    const code = spec.code.map(([file, needle]) => assertEvidenceFile(projectRoot, file, needle).path);
    const tests = spec.tests.map(([file, needle]) => assertEvidenceFile(projectRoot, file, needle).path);
    return { id: spec.id, decision: spec.title, originalStatus: rows[spec.id][3], code, tests,
      sourceStatus: alreadyIndexed.has(spec.id) ? 'ALREADY_INDEXED_PARTIAL' : 'PARTIAL_SOURCE_GAP',
      missingImplementation: [spec.gap], productionVerified: false };
  });
  const duplicates = decisions.filter(d => alreadyIndexed.has(d.id)).map(d => d.id);
  if (decisions.length !== 7 || duplicates.join(',') !== '75,76') throw Error('v166 duplicate decision audit mismatch; NOT VERIFIED');
  const newSourceTraces = decisions.length - duplicates.length;
  const uniqueSourceTraces = prev.uniqueSourceTraces + newSourceTraces;
  return { version: 'v166', totalDecisions: 185, registrySha256: summary.sha256,
    previousSourceTraces: prev.uniqueSourceTraces, reviewedDecisions: 7, alreadyIndexed: duplicates,
    newSourceTraces, uniqueSourceTraces, notYetTraced: 185 - uniqueSourceTraces,
    decisions, knownGaps: [...prev.knownGaps, ...decisions.filter(d => !duplicates.includes(d.id)).map(d => ({id:d.id,missingImplementation:d.missingImplementation}))],
    originalCounts: summary.counts, postgresE2E:'NOT_RUN', browserE2E:'NOT_RUN',
    cdnMediaBenchmark:'NOT_RUN', collaborativeCollections:'NOT_IMPLEMENTED',
    productionReady:false, releaseReadiness:'NOT_VERIFIED' };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const report = auditSevenGuidance();
    if (process.argv.includes('--require-production')) throw Error('v166 production readiness NOT VERIFIED');
    console.log(process.argv.includes('--json') ? JSON.stringify(report,null,2) : `v166 reviewed 7, new 5, unique ${report.uniqueSourceTraces}/185, production NOT VERIFIED`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
