# USTARA v213 — PostgreSQL CI dalilining commit va workflow manbasini tekshirish

## Manba va chegaralar

- Boshlang'ich arxiv: `USTARA-v212-Descriptor-Anchored-CI-Evidence.zip`.
- GitHub'ga hech narsa yuborilmadi, hech qanday deployment bajarilmadi.
- **Haqiqiy PostgreSQL 18 integratsiya testi bajarilmadi:** joriy ish muhitida `postgres`, `psql` va `docker` dasturlari mavjud emas. Shu sababli migratsiya va bron to'qnashuvi haqidagi real DB natijalari **tasdiqlanmagan**.
- Shu hisobotdagi 182/182 — faqat Node.js offline unit/regression testlari.

## v213 o'zgarishlari

1. `backend/scripts/v213-ci-provenance.cjs` yaratildi. Faqat `workflow_dispatch` tadbirida GitHub manbasini qat'iy tekshiradi: `GITHUB_SHA` (40 belgili haqiqiy sintaksisdagi SHA), `GITHUB_REPOSITORY`, `GITHUB_REF`, `GITHUB_WORKFLOW_REF` va `GITHUB_EVENT_NAME`.
2. `backend/scripts/v196-integration-evidence.cjs` dalil sxemasi `ustara.booking-concurrency-evidence.v2` ga o'tkazildi; CI commit, repo, ref va workflow manbasi qo'shildi. TAP xeshi va mavjud barcha cheklovlar saqlandi.
3. `backend/scripts/v197-verify-evidence.cjs` dalilni faqat joriy GitHub run ID, attempt, commit va workflow/ref mos kelganda qabul qiladi; eski v1 sxemasi bilan yanglish tasdiqlashni rad etadi.
4. `backend/scripts/v208-integration-exit-gate.cjs` CI manbasini test subprocessini ishga tushirishdan **oldin** tekshiradi. Nomuvofiqlik bo'lsa yozuvchi PostgreSQL testi boshlanmaydi.
5. `.github/workflows/v193-isolated-postgres-booking.yml` ga DB yaratishdan oldin `v213` CI identity preflight qo'shildi; checkout commit `git rev-parse HEAD` bilan tekshiriladi. Workflow hanuz **faqat qo'lda** ishga tushiriladi.
6. 12 ta yangi unit-test (`backend/test/v213CommitWorkflowProvenance.unit.test.js`) qo'shildi; oldingi testdagi versiya va yangi dalil sxemasiga mos fixture'lar yangilandi.

> Eslatma: bu autentikatsiya yoki raqamli imzo emas; joriy GitHub Actions kontekstiga bog'langan tekshiruv metadata'sidir. GitHub workflow'ining real bajarilganligi faqat GitHub Actions run natijasi bilan tasdiqlanadi.

## Tekshiruv natijalari

- Boshlang'ich v212: **170/170 PASS**.
- Yakuniy v213: **182/182 PASS** (`cd backend && npm run test:v213:unit`).
- Node.js sintaksisi (o'zgartirilgan scriptlar va yangi test): **PASS**.
- `backend/package.json`: **to'g'ri JSON**.
- GitHub Actions YAML: **muvaffaqiyatli parse qilindi**, manual-only trigger saqlandi.
- ZIP integritet testi: arxiv yig'ilgach alohida tekshiriladi.
- PostgreSQL real integratsiya / CI workflow run / production: **BAJARILMAGAN**.

## Keyingi amaliy qadam

Izolyatsiya qilingan PostgreSQL 18 service bilan `v193-isolated-postgres-booking.yml` workflow'ni GitHub Actions'da qo'lda ishga tushirish kerak. U faqat loyiha kodlari masofaviy repozitoriyga joylanib, workflow u yerda mavjud bo'lganda bajarilishi mumkin. Ushbu arxivdan GitHub'ga hech qanday push/dispatch qilinmagan.

Arxivdagi 185 qaror hujjati saqlandi; shu bosqich barcha funksiyalar production uchun tayyor degan ma'noni bildirmaydi.
