// v157: index the next seven ORIGINAL decisions. Source references and unit
// tests are evidence of implementation paths, not live production readiness.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditNextSeven } from './v156-seven-ui-decisions.mjs';
import { auditCriticalDecisions, assertEvidenceFile } from './v155-critical-decisions.mjs';
import { parseCsv, summarizeDecisions } from './v153-decision-progress.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const NEXT_SEVEN = Object.freeze([
  Object.freeze({ id: 10, title: 'Sayt va Telegram real-time bildirishnomalari',
    code: [['backend/services/telegramBookingNotifications.js', 'module.exports'], ['frontend/src/pages/user/bookings/notifications.js', 'bookingStatusItems']],
    tests: [['backend/test/bookingNotificationAfterCommit.unit.test.js', 'test('], ['frontend/test/bookingNotifications.test.js', 'test(']] }),
  Object.freeze({ id: 11, title: 'Xizmatlarni tahrirlash va faolligini boshqarish',
    code: [['backend/controllers/servicesController.js', 'setServiceStatus'], ['frontend/src/pages/barber/Services.jsx', 'validateServiceDraft']],
    tests: [['backend/test/v76ServiceArchive.unit.test.js', 'test('], ['frontend/test/v73ServiceForm.test.js', 'test(']] }),
  Object.freeze({ id: 12, title: 'Portfolio foto va video ishlari',
    code: [['backend/controllers/socialController.js', 'mediaUpload'], ['frontend/src/pages/barber/Portfolio.jsx', 'PortfolioVideo']],
    tests: [['backend/test/v157PublicGuestProfile.unit.test.js', 'test('], ['frontend/test/publicProfile.test.js', 'test(']] }),
  Object.freeze({ id: 13, title: 'Tasdiqlangan tashrifdan keyin baho va javob',
    code: [['backend/controllers/reviewsController.js', "b.status='completed'"], ['frontend/src/pages/barber/Reviews.jsx', 'replyToReview']],
    tests: [['backend/test/v157PublicGuestProfile.unit.test.js', 'test('], ['frontend/test/publicProfile.test.js', 'test(']] }),
  Object.freeze({ id: 14, title: 'Tasdiqlangan manzil va xarita',
    code: [['backend/controllers/barbersController.js', 'verification_status'], ['frontend/src/pages/user/BarbersMap.jsx', 'mappedBarbers']],
    tests: [['frontend/test/v124MapBookingAndDistanceSafety.test.js', 'test('], ['backend/test/barber-profile.unit.test.js', 'test(']] }),
  Object.freeze({ id: 15, title: 'Mavjud profil uslubi va tahrirlash',
    code: [['backend/services/barberProfile.js', 'normalizeBarberProfilePatch'], ['frontend/src/pages/barber/BarberProfileEdit.jsx', 'validateSetupDraft']],
    tests: [['backend/test/barber-profile.unit.test.js', 'test('], ['frontend/test/barberSetup.test.js', 'test(']] }),
  Object.freeze({ id: 16, title: 'Smart Search qidirish va filtrlar',
    code: [['frontend/src/pages/user/explore/catalog.js', 'selectResults'], ['frontend/src/pages/user/Explore.jsx', 'loadExploreCatalog']],
    tests: [['frontend/test/v117ExploreSearchContract.test.js', 'test(']] }),
]);

export function auditPublicSeven({ projectRoot = ROOT, registryPath = path.join(ROOT, 'docs/USTARA_185_NAZORAT.csv') } = {}) {
  const summary = summarizeDecisions(registryPath);
  const previousCritical = auditCriticalDecisions({ projectRoot, registryPath });
  const previousUi = auditNextSeven({ projectRoot, registryPath });
  const previousIds = new Set([...previousCritical.decisions.map(x => x.id), ...previousUi.decisions.map(x => x.id)]);
  if (previousIds.size !== 14 || previousUi.uniqueSourceTraces !== 14) {
    throw Error('v157: previous source indexes disagree; NOT VERIFIED');
  }
  const rows = parseCsv(fs.readFileSync(registryPath, 'utf8').replace(/^\ufeff/, ''));
  const current = new Set();
  const decisions = NEXT_SEVEN.map(spec => {
    if (previousIds.has(spec.id) || current.has(spec.id) || rows[spec.id]?.[0] !== String(spec.id) || rows[spec.id]?.[1] !== spec.title) {
      throw Error('v157: duplicate or changed decision text; NOT VERIFIED');
    }
    current.add(spec.id);
    const code = spec.code.map(([filename, needle]) => assertEvidenceFile(projectRoot, filename, needle).path);
    const tests = spec.tests.map(([filename, needle]) => assertEvidenceFile(projectRoot, filename, needle).path);
    if (code.length < 2 || tests.length < 1 || code.some(x => tests.includes(x))) {
      throw Error('v157: insufficient independent source/test references; NOT VERIFIED');
    }
    return { id: spec.id, decision: spec.title, originalStatus: rows[spec.id][3], code, tests,
      sourceStatus: 'REFERENCES_PRESENT_ONLY', unitStatus: 'NOT_INFERRED', productionVerified: false };
  });
  return {
    version: 'v157', registrySha256: summary.sha256, totalDecisions: 185,
    previousSourceTraces: previousIds.size, newSourceTraces: decisions.length,
    uniqueSourceTraces: previousIds.size + decisions.length,
    notYetTraced: 185 - previousIds.size - decisions.length,
    decisions, originalCounts: summary.counts,
    guestPublicPortfolioAndReviews: 'UNIT_TESTED_ONLY',
    notificationRealtimeE2E: 'NOT_VERIFIED', postgresE2E: 'NOT_RUN', browserE2E: 'NOT_RUN',
    releaseReadiness: 'NOT_VERIFIED', productionReady: false,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = auditPublicSeven();
    if (process.argv.includes('--require-production')) throw Error('v157: PG/Chrome/Telegram not verified; NOT VERIFIED');
    console.log(process.argv.includes('--json') ? JSON.stringify(report, null, 2) :
      `v157: ${report.uniqueSourceTraces}/185 mapped with source/tests. Production NOT VERIFIED.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
