# USTARA v208 — Process Exit & Evidence Gate

Sana: 2026-11-21

## Nima o'zgardi

v207 GitHub Actions'da booking concurrency testi Node TAP hisobotini shell quvuri orqali evidence parseriga uzatardi. `set -euo pipefail` tufayli noto'g'ri exit kodi odatda job'ni yiqitadi; ammo subprocessning yakunlanganini, chiqish signalini, TAP maksimal hajmini va timeoutni bitta joyda explicit tekshirish qulayroq. v208 ushbu tekshiruvlarni birlashtiradi.

- `backend/scripts/v208-integration-exit-gate.cjs`: faqat ruxsat etilgan test URLini qabul qiladi, Node.js `--test --test-reporter=tap test/bookingConcurrency.postgres.integration.test.js` ni **shell ishlatmasdan** alohida jarayonda ishga tushiradi; chiqish kodi 0, signal yo'q, yakunlangan TAP, 4 MB limit va 150 s timeoutni talab qiladi.
- v203 talab qilgan 12 ta ichki concurrency case, v195–v203 TAP strukturasi va GitHub run ID/attempt mos kelmasa, JSON evidence umuman saqlanmaydi.
- Oldingi evidence fayli bo'lsa, qayta ishlatilmaydi; `writeEvidence` baribir `wx` bilan faqat yangi fayl yaratadi.
- `.github/workflows/v193-isolated-postgres-booking.yml`: CI integratsiya bosqichi yangi runnerga o'tdi; 14 ta jadval preflight/postflight, `!cancelled()` failure postflight va success-only artifact sharti saqlandi.
- `backend/package.json`: `test:v208:unit` qo'shildi.
- `backend/test/v208IntegrationExitGate.unit.test.js`: 13 ta yangi offline regression-test, subprocess exit, signal, timeout, hajm chegarasi, bosh bo'sh TAP, noto'g'ri DB ruxsati, soxta case, stale file va CI tartibini tekshiradi. Oldingi testlarning CI workflowga oid assertionlari yangi runnerga moslashtirildi.

## Amalda bajarilgan tekshiruvlar

- `npm run test:v208:unit`: **133/133 PASS**, fail=0, skipped=0 (120 ta oldingi + 13 ta yangi test).
- Tegishli JavaScript manbalarida `node --check`: PASS.
- PyYAML bilan GitHub Actions workflow: PASS (15 qadam, manual trigger, disposable PG18, postflight va success-only upload).
- No-approved-URL CLI smoke test: expected BLOCKED; haqiqiy testni **boshlamadi**.
- ZIP CRC va arxivdagi zarur fayllar tekshiriladi.

## Cheklovlar

- Bu muhitda PostgreSQL 18, `psql` va Docker o'rnatilmagan. Real PostgreSQL integration/production sinovi **bajarilmadi**; unit-test muvaffaqiyati production tayyorligini anglatmaydi.
- GitHub'ning `Nurbekn/USTARA-New` public `main` branchidan tekshirganda `.github/workflows/v193-isolated-postgres-booking.yml` manzili topilmadi. Demak v208 ZIPni repoga commit/push qilmaguncha ayni workflowni GitHub Actions'dan ishga tushirib bo'lmaydi. Repositoryga hech narsa push qilinmadi.
- Hech qanday production DB/Telegram tokenidan foydalanilmadi.

## Keyingi amaliy qadam

Yangilangan `USTARA-New` loyihasini mos GitHub reposiga joylash, so'ng GitHub Actions panelida **USTARA v193 - opt-in isolated PostgreSQL booking concurrency** workflowini qo'lda ishga tushirish. Ketma-ketlik: PostgreSQL 18 service, bootstrap, runtime proof, preflight 14/14, 12 ta ichki booking concurrency sinovi, postflight 14/14, CI attemptga bog'langan JSON evidence. Real run logiga qarab keyingi tuzatishlar qilinadi.
